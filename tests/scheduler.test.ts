import { describe, test, expect } from "bun:test";
import {
  validateDAG,
  detectCycle,
  topologicalSort,
  getReadyStages,
} from "../src/engine/scheduler.ts";
import type { StageDefinition } from "../src/types.ts";

describe("DAG Validation", () => {
  test("validates a simple linear pipeline", () => {
    const stages: StageDefinition[] = [
      { id: "a", type: "extractor" },
      { id: "b", type: "transformer", dependsOn: ["a"] },
      { id: "c", type: "validator", dependsOn: ["b"] },
    ];
    expect(validateDAG(stages)).toBeNull();
  });

  test("validates a pipeline with parallel stages", () => {
    const stages: StageDefinition[] = [
      { id: "a", type: "extractor" },
      { id: "b", type: "transformer" },
      { id: "c", type: "validator", dependsOn: ["a", "b"] },
    ];
    expect(validateDAG(stages)).toBeNull();
  });

  test("validates a single-stage pipeline", () => {
    const stages: StageDefinition[] = [{ id: "a", type: "extractor" }];
    expect(validateDAG(stages)).toBeNull();
  });

  test("detects duplicate stage IDs", () => {
    const stages: StageDefinition[] = [
      { id: "a", type: "extractor" },
      { id: "a", type: "transformer" },
    ];
    expect(validateDAG(stages)).toBe("Duplicate stage IDs detected");
  });

  test("detects unknown dependency", () => {
    const stages: StageDefinition[] = [
      { id: "a", type: "extractor", dependsOn: ["nonexistent"] },
    ];
    expect(validateDAG(stages)).toBe(
      'Stage "a" depends on unknown stage "nonexistent"'
    );
  });

  test("detects self-dependency", () => {
    const stages: StageDefinition[] = [
      { id: "a", type: "extractor", dependsOn: ["a"] },
    ];
    expect(validateDAG(stages)).toBe('Stage "a" cannot depend on itself');
  });

  test("detects a simple cycle (A -> B -> A)", () => {
    const stages: StageDefinition[] = [
      { id: "a", type: "extractor", dependsOn: ["b"] },
      { id: "b", type: "transformer", dependsOn: ["a"] },
    ];
    expect(validateDAG(stages)).toBe("Pipeline contains a cycle");
  });

  test("detects a longer cycle (A -> B -> C -> A)", () => {
    const stages: StageDefinition[] = [
      { id: "a", type: "extractor", dependsOn: ["c"] },
      { id: "b", type: "transformer", dependsOn: ["a"] },
      { id: "c", type: "validator", dependsOn: ["b"] },
    ];
    expect(validateDAG(stages)).toBe("Pipeline contains a cycle");
  });
});

describe("Cycle Detection", () => {
  test("returns false for acyclic graph", () => {
    const stages: StageDefinition[] = [
      { id: "a", type: "extractor" },
      { id: "b", type: "transformer", dependsOn: ["a"] },
    ];
    expect(detectCycle(stages)).toBe(false);
  });

  test("returns true for cyclic graph", () => {
    const stages: StageDefinition[] = [
      { id: "a", type: "extractor", dependsOn: ["b"] },
      { id: "b", type: "transformer", dependsOn: ["a"] },
    ];
    expect(detectCycle(stages)).toBe(true);
  });
});

describe("Topological Sort", () => {
  test("sorts a linear pipeline into sequential batches", () => {
    const stages: StageDefinition[] = [
      { id: "a", type: "extractor" },
      { id: "b", type: "transformer", dependsOn: ["a"] },
      { id: "c", type: "validator", dependsOn: ["b"] },
    ];
    const batches = topologicalSort(stages);

    expect(batches.length).toBe(3);
    expect(batches[0]!.length).toBe(1);
    expect(batches[0]![0]!.id).toBe("a");
    expect(batches[1]![0]!.id).toBe("b");
    expect(batches[2]![0]!.id).toBe("c");
  });

  test("groups independent stages into the same batch", () => {
    const stages: StageDefinition[] = [
      { id: "a", type: "extractor" },
      { id: "b", type: "transformer" },
      { id: "c", type: "validator", dependsOn: ["a", "b"] },
    ];
    const batches = topologicalSort(stages);

    expect(batches.length).toBe(2);
    expect(batches[0]!.length).toBe(2);
    const firstBatchIds = batches[0]!.map((s) => s.id).sort();
    expect(firstBatchIds).toEqual(["a", "b"]);
    expect(batches[1]![0]!.id).toBe("c");
  });

  test("handles diamond dependency graph", () => {
    const stages: StageDefinition[] = [
      { id: "a", type: "extractor" },
      { id: "b", type: "transformer", dependsOn: ["a"] },
      { id: "c", type: "validator", dependsOn: ["a"] },
      { id: "d", type: "summarizer", dependsOn: ["b", "c"] },
    ];
    const batches = topologicalSort(stages);

    expect(batches.length).toBe(3);
    expect(batches[0]![0]!.id).toBe("a");
    const midBatchIds = batches[1]!.map((s) => s.id).sort();
    expect(midBatchIds).toEqual(["b", "c"]);
    expect(batches[2]![0]!.id).toBe("d");
  });
});

describe("getReadyStages", () => {
  test("returns stages with no dependencies when none completed", () => {
    const stages: StageDefinition[] = [
      { id: "a", type: "extractor" },
      { id: "b", type: "transformer", dependsOn: ["a"] },
    ];
    const completed = new Set<string>();
    const ready = getReadyStages(stages, completed);

    expect(ready.length).toBe(1);
    expect(ready[0]!.id).toBe("a");
  });

  test("returns dependent stages when dependencies are completed", () => {
    const stages: StageDefinition[] = [
      { id: "a", type: "extractor" },
      { id: "b", type: "transformer", dependsOn: ["a"] },
      { id: "c", type: "validator", dependsOn: ["b"] },
    ];
    const completed = new Set(["a"]);
    const ready = getReadyStages(stages, completed);

    expect(ready.length).toBe(1);
    expect(ready[0]!.id).toBe("b");
  });

  test("does not return already-completed stages", () => {
    const stages: StageDefinition[] = [
      { id: "a", type: "extractor" },
      { id: "b", type: "transformer", dependsOn: ["a"] },
    ];
    const completed = new Set(["a", "b"]);
    const ready = getReadyStages(stages, completed);

    expect(ready.length).toBe(0);
  });
});
