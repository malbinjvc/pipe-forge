import { describe, test, expect, beforeEach } from "bun:test";
import { saveCheckpoint, restoreCheckpoint } from "../src/engine/checkpoint.ts";
import { store } from "../src/services/store.ts";
import type { PipelineRun, StageResult } from "../src/types.ts";

function createMockRun(overrides?: Partial<PipelineRun>): PipelineRun {
  return {
    id: "run_test1",
    pipelineId: "pipe_test1",
    status: "running",
    input: { text: "hello" },
    stageResults: new Map<string, StageResult>(),
    startedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("Checkpoint", () => {
  beforeEach(() => {
    store.reset();
  });

  test("saves a checkpoint with current stage results", () => {
    const run = createMockRun();
    run.stageResults.set("extract", {
      stageId: "extract",
      status: "completed",
      output: { entities: ["a", "b"] },
      retries: 0,
    });

    const checkpoint = saveCheckpoint(run);

    expect(checkpoint.runId).toBe("run_test1");
    expect(checkpoint.pipelineId).toBe("pipe_test1");
    expect(checkpoint.stageResults["extract"]).toBeDefined();
    expect(checkpoint.stageResults["extract"]!.status).toBe("completed");
    expect(run.checkpointId).toBe(checkpoint.id);
  });

  test("checkpoint is stored in the store", () => {
    const run = createMockRun();
    const checkpoint = saveCheckpoint(run);

    const retrieved = store.getCheckpoint(checkpoint.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(checkpoint.id);
  });

  test("restores a checkpoint into a run", () => {
    const run = createMockRun();
    run.stageResults.set("extract", {
      stageId: "extract",
      status: "completed",
      output: { entities: ["a"] },
      retries: 0,
    });
    run.stageResults.set("transform", {
      stageId: "transform",
      status: "failed",
      error: "timeout",
      retries: 2,
    });

    const checkpoint = saveCheckpoint(run);

    // Create a fresh run and restore
    const newRun = createMockRun({ id: "run_test1" });
    const completedIds = restoreCheckpoint(newRun, checkpoint.id);

    expect(completedIds.size).toBe(1);
    expect(completedIds.has("extract")).toBe(true);
    expect(completedIds.has("transform")).toBe(false);
    expect(newRun.stageResults.get("extract")?.status).toBe("completed");
    expect(newRun.stageResults.get("transform")?.status).toBe("failed");
  });

  test("throws for non-existent checkpoint", () => {
    const run = createMockRun();
    expect(() => restoreCheckpoint(run, "cp_nonexistent")).toThrow(
      'Checkpoint "cp_nonexistent" not found'
    );
  });

  test("throws when checkpoint doesn't belong to the run", () => {
    const run1 = createMockRun({ id: "run_1" });
    const checkpoint = saveCheckpoint(run1);

    const run2 = createMockRun({ id: "run_2" });
    expect(() => restoreCheckpoint(run2, checkpoint.id)).toThrow(
      `does not belong to run "run_2"`
    );
  });
});
