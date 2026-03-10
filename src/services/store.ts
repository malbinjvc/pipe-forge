import type {
  PipelineDefinition,
  PipelineRun,
  Checkpoint,
  SystemStats,
  PipelineRunSerialized,
} from "../types.ts";

export class Store {
  private pipelines: Map<string, PipelineDefinition> = new Map();
  private runs: Map<string, PipelineRun> = new Map();
  private checkpoints: Map<string, Checkpoint> = new Map();
  private startTime: number = Date.now();

  // ---- Pipelines ----

  addPipeline(pipeline: PipelineDefinition): void {
    this.pipelines.set(pipeline.id, pipeline);
  }

  getPipeline(id: string): PipelineDefinition | undefined {
    return this.pipelines.get(id);
  }

  listPipelines(): PipelineDefinition[] {
    return Array.from(this.pipelines.values());
  }

  deletePipeline(id: string): boolean {
    return this.pipelines.delete(id);
  }

  // ---- Runs ----

  addRun(run: PipelineRun): void {
    this.runs.set(run.id, run);
  }

  getRun(id: string): PipelineRun | undefined {
    return this.runs.get(id);
  }

  listRunsForPipeline(pipelineId: string): PipelineRun[] {
    return Array.from(this.runs.values()).filter(
      (run) => run.pipelineId === pipelineId
    );
  }

  // ---- Checkpoints ----

  addCheckpoint(checkpoint: Checkpoint): void {
    this.checkpoints.set(checkpoint.id, checkpoint);
  }

  getCheckpoint(id: string): Checkpoint | undefined {
    return this.checkpoints.get(id);
  }

  getCheckpointForRun(runId: string): Checkpoint | undefined {
    return Array.from(this.checkpoints.values()).find(
      (cp) => cp.runId === runId
    );
  }

  // ---- Serialization helpers ----

  serializeRun(run: PipelineRun): PipelineRunSerialized {
    return {
      id: run.id,
      pipelineId: run.pipelineId,
      status: run.status,
      input: run.input,
      stageResults: Object.fromEntries(run.stageResults),
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      checkpointId: run.checkpointId,
    };
  }

  // ---- Stats ----

  getStats(): SystemStats {
    const runsByStatus: Record<string, number> = {};
    for (const run of this.runs.values()) {
      runsByStatus[run.status] = (runsByStatus[run.status] ?? 0) + 1;
    }

    return {
      totalPipelines: this.pipelines.size,
      totalRuns: this.runs.size,
      runsByStatus,
      totalCheckpoints: this.checkpoints.size,
      uptime: Date.now() - this.startTime,
    };
  }

  // ---- Reset (for testing) ----

  reset(): void {
    this.pipelines.clear();
    this.runs.clear();
    this.checkpoints.clear();
    this.startTime = Date.now();
  }
}

export const store = new Store();
