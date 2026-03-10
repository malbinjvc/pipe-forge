import type { StageDefinition } from "../types.ts";

/**
 * Validates that the stage graph is a valid DAG (no cycles).
 * Returns an error message if invalid, or null if valid.
 */
export function validateDAG(stages: StageDefinition[]): string | null {
  const stageIds = new Set(stages.map((s) => s.id));

  // Check for duplicate IDs
  if (stageIds.size !== stages.length) {
    return "Duplicate stage IDs detected";
  }

  // Check that all dependencies reference valid stage IDs
  for (const stage of stages) {
    if (stage.dependsOn) {
      for (const dep of stage.dependsOn) {
        if (!stageIds.has(dep)) {
          return `Stage "${stage.id}" depends on unknown stage "${dep}"`;
        }
        if (dep === stage.id) {
          return `Stage "${stage.id}" cannot depend on itself`;
        }
      }
    }
  }

  // Cycle detection using Kahn's algorithm
  const hasCycle = detectCycle(stages);
  if (hasCycle) {
    return "Pipeline contains a cycle";
  }

  return null;
}

/**
 * Detects cycles in the stage graph using Kahn's algorithm.
 */
export function detectCycle(stages: StageDefinition[]): boolean {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const stage of stages) {
    inDegree.set(stage.id, 0);
    adjacency.set(stage.id, []);
  }

  for (const stage of stages) {
    if (stage.dependsOn) {
      for (const dep of stage.dependsOn) {
        const existing = adjacency.get(dep);
        if (existing) {
          existing.push(stage.id);
        }
        inDegree.set(stage.id, (inDegree.get(stage.id) ?? 0) + 1);
      }
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  let processedCount = 0;

  while (queue.length > 0) {
    const current = queue.shift()!;
    processedCount++;

    const neighbors = adjacency.get(current) ?? [];
    for (const neighbor of neighbors) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  return processedCount !== stages.length;
}

/**
 * Returns stages in topological order using Kahn's algorithm.
 * Returns batches of stages that can be executed in parallel.
 */
export function topologicalSort(
  stages: StageDefinition[]
): StageDefinition[][] {
  const stageMap = new Map<string, StageDefinition>();
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const stage of stages) {
    stageMap.set(stage.id, stage);
    inDegree.set(stage.id, 0);
    adjacency.set(stage.id, []);
  }

  for (const stage of stages) {
    if (stage.dependsOn) {
      for (const dep of stage.dependsOn) {
        const existing = adjacency.get(dep);
        if (existing) {
          existing.push(stage.id);
        }
        inDegree.set(stage.id, (inDegree.get(stage.id) ?? 0) + 1);
      }
    }
  }

  const batches: StageDefinition[][] = [];

  let queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  while (queue.length > 0) {
    const batch: StageDefinition[] = [];
    const nextQueue: string[] = [];

    for (const id of queue) {
      const stage = stageMap.get(id);
      if (stage) {
        batch.push(stage);
      }

      const neighbors = adjacency.get(id) ?? [];
      for (const neighbor of neighbors) {
        const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          nextQueue.push(neighbor);
        }
      }
    }

    if (batch.length > 0) {
      batches.push(batch);
    }
    queue = nextQueue;
  }

  return batches;
}

/**
 * Returns the set of stages that are ready to execute
 * (all dependencies completed).
 */
export function getReadyStages(
  stages: StageDefinition[],
  completedStageIds: Set<string>
): StageDefinition[] {
  return stages.filter((stage) => {
    if (completedStageIds.has(stage.id)) return false;
    if (!stage.dependsOn || stage.dependsOn.length === 0) return true;
    return stage.dependsOn.every((dep) => completedStageIds.has(dep));
  });
}
