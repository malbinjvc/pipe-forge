import type {
  PipelineDefinition,
  PipelineRun,
  StageResult,
  StageDefinition,
  AgentType,
  SSEEvent,
} from "../types.ts";
import type { ClaudeClient } from "../services/claude-client.ts";
import { topologicalSort, validateDAG } from "./scheduler.ts";
import { saveCheckpoint } from "./checkpoint.ts";
import { withRetry } from "../services/retry.ts";
import { BaseAgent } from "../agents/base.ts";
import { ExtractorAgent } from "../agents/extractor.ts";
import { TransformerAgent } from "../agents/transformer.ts";
import { ValidatorAgent } from "../agents/validator.ts";
import { SummarizerAgent } from "../agents/summarizer.ts";

export type EventCallback = (event: SSEEvent) => void;

function createAgent(type: AgentType, client: ClaudeClient): BaseAgent {
  switch (type) {
    case "extractor":
      return new ExtractorAgent(client);
    case "transformer":
      return new TransformerAgent(client);
    case "validator":
      return new ValidatorAgent(client);
    case "summarizer":
      return new SummarizerAgent(client);
  }
}

/**
 * Resolves the input for a stage, gathering outputs from dependencies.
 */
function resolveStageInput(
  stage: StageDefinition,
  run: PipelineRun,
  pipelineInput: unknown
): unknown {
  if (!stage.dependsOn || stage.dependsOn.length === 0) {
    return pipelineInput;
  }

  if (stage.dependsOn.length === 1) {
    const depId = stage.dependsOn[0]!;
    const depResult = run.stageResults.get(depId);
    return depResult?.output ?? pipelineInput;
  }

  // Multiple dependencies: merge outputs into an object
  const merged: Record<string, unknown> = {};
  for (const depId of stage.dependsOn) {
    const depResult = run.stageResults.get(depId);
    merged[depId] = depResult?.output ?? null;
  }
  return merged;
}

export class PipelineEngine {
  private client: ClaudeClient;

  constructor(client: ClaudeClient) {
    this.client = client;
  }

  /**
   * Execute a pipeline run.
   */
  async execute(
    pipeline: PipelineDefinition,
    run: PipelineRun,
    onEvent?: EventCallback
  ): Promise<PipelineRun> {
    // Validate the DAG
    const validationError = validateDAG(pipeline.stages);
    if (validationError) {
      run.status = "failed";
      run.completedAt = new Date().toISOString();
      this.emit(onEvent, "pipeline:error", {
        runId: run.id,
        error: validationError,
      });
      return run;
    }

    run.status = "running";
    this.emit(onEvent, "pipeline:started", {
      runId: run.id,
      pipelineId: pipeline.id,
    });

    // Get batches in topological order
    const batches = topologicalSort(pipeline.stages);

    try {
      for (const batch of batches) {
        // Execute all stages in a batch in parallel
        const promises = batch.map((stage) =>
          this.executeStage(stage, run, pipeline, onEvent)
        );
        await Promise.all(promises);

        // Check if any stage in the batch failed
        const failed = batch.some((stage) => {
          const result = run.stageResults.get(stage.id);
          return result?.status === "failed";
        });

        if (failed) {
          // Skip remaining stages
          this.skipRemainingStages(pipeline.stages, run);
          run.status = "failed";
          run.completedAt = new Date().toISOString();
          this.emit(onEvent, "pipeline:failed", { runId: run.id });
          return run;
        }

        // Save checkpoint after each batch
        saveCheckpoint(run);
        this.emit(onEvent, "pipeline:checkpoint", { runId: run.id });
      }

      run.status = "completed";
      run.completedAt = new Date().toISOString();
      this.emit(onEvent, "pipeline:completed", { runId: run.id });
    } catch (err) {
      run.status = "failed";
      run.completedAt = new Date().toISOString();
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.emit(onEvent, "pipeline:error", {
        runId: run.id,
        error: errorMsg,
      });
    }

    return run;
  }

  private async executeStage(
    stage: StageDefinition,
    run: PipelineRun,
    _pipeline: PipelineDefinition,
    onEvent?: EventCallback
  ): Promise<void> {
    const stageResult: StageResult = {
      stageId: stage.id,
      status: "running",
      startedAt: new Date().toISOString(),
      retries: 0,
    };
    run.stageResults.set(stage.id, stageResult);

    this.emit(onEvent, "stage:started", {
      runId: run.id,
      stageId: stage.id,
    });

    // Check if dependencies are all completed
    if (stage.dependsOn) {
      for (const depId of stage.dependsOn) {
        const depResult = run.stageResults.get(depId);
        if (depResult?.status === "failed" || depResult?.status === "skipped") {
          stageResult.status = "skipped";
          stageResult.completedAt = new Date().toISOString();
          this.emit(onEvent, "stage:skipped", {
            runId: run.id,
            stageId: stage.id,
          });
          return;
        }
      }
    }

    try {
      const agent = createAgent(stage.type, this.client);
      const input = resolveStageInput(stage, run, run.input);

      const retryOpts = {
        maxRetries: stage.config?.retryCount ?? 2,
        baseDelayMs: stage.config?.retryDelayMs ?? 500,
        maxDelayMs: 30000,
      };

      const { result, retries } = await withRetry(
        () => agent.process(input, stage.config),
        retryOpts
      );

      stageResult.status = "completed";
      stageResult.output = result;
      stageResult.retries = retries;
      stageResult.completedAt = new Date().toISOString();

      this.emit(onEvent, "stage:completed", {
        runId: run.id,
        stageId: stage.id,
        retries,
      });
    } catch (err) {
      stageResult.status = "failed";
      stageResult.error =
        err instanceof Error ? err.message : String(err);
      stageResult.completedAt = new Date().toISOString();

      this.emit(onEvent, "stage:failed", {
        runId: run.id,
        stageId: stage.id,
        error: stageResult.error,
      });
    }
  }

  private skipRemainingStages(
    stages: StageDefinition[],
    run: PipelineRun
  ): void {
    for (const stage of stages) {
      if (!run.stageResults.has(stage.id)) {
        run.stageResults.set(stage.id, {
          stageId: stage.id,
          status: "skipped",
          completedAt: new Date().toISOString(),
          retries: 0,
        });
      }
    }
  }

  private emit(
    onEvent: EventCallback | undefined,
    event: string,
    data: unknown
  ): void {
    if (onEvent) {
      onEvent({ event, data });
    }
  }
}
