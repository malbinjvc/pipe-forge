import { describe, test, expect, mock, beforeEach } from "bun:test";
import { PipelineEngine } from "../src/engine/pipeline.ts";
import { store } from "../src/services/store.ts";
import type {
  PipelineDefinition,
  PipelineRun,
  StageResult,
  SSEEvent,
} from "../src/types.ts";
import type { ClaudeClient } from "../src/services/claude-client.ts";

function createMockClient(response: string = '{"result": "ok"}'): ClaudeClient {
  return {
    sendMessage: mock(() => Promise.resolve(response)),
  } as unknown as ClaudeClient;
}

function createPipeline(overrides?: Partial<PipelineDefinition>): PipelineDefinition {
  return {
    id: "pipe_test",
    name: "Test Pipeline",
    stages: [
      { id: "extract", type: "extractor" },
      { id: "transform", type: "transformer", dependsOn: ["extract"] },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createRun(pipelineId: string = "pipe_test"): PipelineRun {
  return {
    id: "run_test",
    pipelineId,
    status: "pending",
    input: { text: "test data" },
    stageResults: new Map<string, StageResult>(),
    startedAt: new Date().toISOString(),
  };
}

describe("PipelineEngine", () => {
  beforeEach(() => {
    store.reset();
  });

  test("executes a simple linear pipeline", async () => {
    const client = createMockClient();
    const engine = new PipelineEngine(client);
    const pipeline = createPipeline();
    const run = createRun();

    store.addPipeline(pipeline);
    store.addRun(run);

    const result = await engine.execute(pipeline, run);

    expect(result.status).toBe("completed");
    expect(result.completedAt).toBeDefined();
    expect(result.stageResults.size).toBe(2);
    expect(result.stageResults.get("extract")?.status).toBe("completed");
    expect(result.stageResults.get("transform")?.status).toBe("completed");
  });

  test("executes parallel independent stages", async () => {
    const client = createMockClient();
    const engine = new PipelineEngine(client);
    const pipeline = createPipeline({
      stages: [
        { id: "a", type: "extractor" },
        { id: "b", type: "transformer" },
        { id: "c", type: "validator", dependsOn: ["a", "b"] },
      ],
    });
    const run = createRun();

    store.addPipeline(pipeline);
    store.addRun(run);

    const result = await engine.execute(pipeline, run);

    expect(result.status).toBe("completed");
    expect(result.stageResults.size).toBe(3);
  });

  test("fails pipeline when a stage fails", async () => {
    let callCount = 0;
    const client = {
      sendMessage: mock(() => {
        callCount++;
        if (callCount <= 3) {
          // extractor agent retries (initial + 2 retries)
          return Promise.reject(new Error("API error"));
        }
        return Promise.resolve('{"ok": true}');
      }),
    } as unknown as ClaudeClient;

    const engine = new PipelineEngine(client);
    const pipeline = createPipeline({
      stages: [
        { id: "extract", type: "extractor", config: { retryCount: 2, retryDelayMs: 10 } },
        { id: "transform", type: "transformer", dependsOn: ["extract"] },
      ],
    });
    const run = createRun();

    store.addPipeline(pipeline);
    store.addRun(run);

    const result = await engine.execute(pipeline, run);

    expect(result.status).toBe("failed");
    expect(result.stageResults.get("extract")?.status).toBe("failed");
    expect(result.stageResults.get("transform")?.status).toBe("skipped");
  });

  test("emits events during execution", async () => {
    const client = createMockClient();
    const engine = new PipelineEngine(client);
    const pipeline = createPipeline({
      stages: [{ id: "extract", type: "extractor" }],
    });
    const run = createRun();

    store.addPipeline(pipeline);
    store.addRun(run);

    const events: SSEEvent[] = [];
    await engine.execute(pipeline, run, (event) => events.push(event));

    const eventTypes = events.map((e) => e.event);
    expect(eventTypes).toContain("pipeline:started");
    expect(eventTypes).toContain("stage:started");
    expect(eventTypes).toContain("stage:completed");
    expect(eventTypes).toContain("pipeline:checkpoint");
    expect(eventTypes).toContain("pipeline:completed");
  });

  test("rejects pipeline with cycle", async () => {
    const client = createMockClient();
    const engine = new PipelineEngine(client);
    const pipeline = createPipeline({
      stages: [
        { id: "a", type: "extractor", dependsOn: ["b"] },
        { id: "b", type: "transformer", dependsOn: ["a"] },
      ],
    });
    const run = createRun();

    const result = await engine.execute(pipeline, run);

    expect(result.status).toBe("failed");
  });

  test("saves checkpoints after each batch", async () => {
    const client = createMockClient();
    const engine = new PipelineEngine(client);
    const pipeline = createPipeline();
    const run = createRun();

    store.addPipeline(pipeline);
    store.addRun(run);

    await engine.execute(pipeline, run);

    // Should have checkpoints saved
    const checkpoint = store.getCheckpointForRun(run.id);
    expect(checkpoint).toBeDefined();
  });
});
