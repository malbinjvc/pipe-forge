import type { PipelineRun, Checkpoint, StageResult } from "../types.ts";
import { store } from "../services/store.ts";

/**
 * Saves a checkpoint for a pipeline run, capturing all current stage results.
 */
export function saveCheckpoint(run: PipelineRun): Checkpoint {
  const id = `cp_${run.id}_${Date.now()}`;

  const stageResults: Record<string, StageResult> = {};
  for (const [key, value] of run.stageResults) {
    stageResults[key] = { ...value };
  }

  const checkpoint: Checkpoint = {
    id,
    runId: run.id,
    pipelineId: run.pipelineId,
    stageResults,
    savedAt: new Date().toISOString(),
  };

  store.addCheckpoint(checkpoint);
  run.checkpointId = id;

  return checkpoint;
}

/**
 * Restores stage results from a checkpoint into a pipeline run.
 * Returns the set of completed stage IDs.
 */
export function restoreCheckpoint(
  run: PipelineRun,
  checkpointId: string
): Set<string> {
  const checkpoint = store.getCheckpoint(checkpointId);
  if (!checkpoint) {
    throw new Error(`Checkpoint "${checkpointId}" not found`);
  }

  if (checkpoint.runId !== run.id) {
    throw new Error(`Checkpoint "${checkpointId}" does not belong to run "${run.id}"`);
  }

  const completedIds = new Set<string>();

  for (const [stageId, result] of Object.entries(checkpoint.stageResults)) {
    run.stageResults.set(stageId, { ...result });
    if (result.status === "completed") {
      completedIds.add(stageId);
    }
  }

  run.checkpointId = checkpointId;

  return completedIds;
}
