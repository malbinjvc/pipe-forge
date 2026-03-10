import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type {
  CreatePipelineInput,
  PipelineDefinition,
  PipelineRun,
  StageResult,
  AgentInfo,
  SSEEvent,
} from "./types.ts";
import { store } from "./services/store.ts";
import { createClaudeClient } from "./services/claude-client.ts";
import { PipelineEngine } from "./engine/pipeline.ts";
import { validateDAG } from "./engine/scheduler.ts";
import { securityHeaders } from "./middleware/security.ts";

const app = new Hono();

// Apply security middleware
app.use("*", securityHeaders);

// ---- Health Check ----

app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ---- Agents ----

app.get("/agents", (c) => {
  const agents: AgentInfo[] = [
    {
      type: "extractor",
      name: "Data Extractor",
      description:
        "Extracts structured data, entities, and key information from raw input",
    },
    {
      type: "transformer",
      name: "Data Transformer",
      description:
        "Transforms, restructures, and enriches data between formats",
    },
    {
      type: "validator",
      name: "Data Validator",
      description:
        "Validates data quality, completeness, and correctness",
    },
    {
      type: "summarizer",
      name: "Data Summarizer",
      description:
        "Summarizes data, generates reports, and produces concise overviews",
    },
  ];
  return c.json({ agents });
});

// ---- Stats ----

app.get("/stats", (c) => {
  const stats = store.getStats();
  return c.json(stats);
});

// ---- Pipelines ----

app.post("/pipelines", async (c) => {
  let body: CreatePipelineInput;
  try {
    body = (await c.req.json()) as CreatePipelineInput;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.name || typeof body.name !== "string") {
    return c.json({ error: "Pipeline name is required" }, 400);
  }

  if (!Array.isArray(body.stages) || body.stages.length === 0) {
    return c.json({ error: "At least one stage is required" }, 400);
  }

  // Validate stage types
  const validTypes = new Set(["extractor", "transformer", "validator", "summarizer"]);
  for (const stage of body.stages) {
    if (!stage.id || typeof stage.id !== "string") {
      return c.json({ error: "Each stage must have a string id" }, 400);
    }
    if (!validTypes.has(stage.type)) {
      return c.json(
        { error: `Invalid stage type "${stage.type}". Valid types: ${Array.from(validTypes).join(", ")}` },
        400
      );
    }
  }

  // Validate DAG
  const dagError = validateDAG(body.stages);
  if (dagError) {
    return c.json({ error: dagError }, 400);
  }

  const pipeline: PipelineDefinition = {
    id: `pipe_${crypto.randomUUID().slice(0, 8)}`,
    name: body.name,
    stages: body.stages,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  store.addPipeline(pipeline);

  return c.json(pipeline, 201);
});

app.get("/pipelines", (c) => {
  const pipelines = store.listPipelines();
  return c.json({ pipelines });
});

app.get("/pipelines/:id", (c) => {
  const pipeline = store.getPipeline(c.req.param("id"));
  if (!pipeline) {
    return c.json({ error: "Pipeline not found" }, 404);
  }
  return c.json(pipeline);
});

// ---- Pipeline Runs ----

app.post("/pipelines/:id/run", async (c) => {
  const pipeline = store.getPipeline(c.req.param("id"));
  if (!pipeline) {
    return c.json({ error: "Pipeline not found" }, 404);
  }

  let input: unknown = {};
  try {
    input = await c.req.json();
  } catch {
    // No body is fine, default to empty object
  }

  const run: PipelineRun = {
    id: `run_${crypto.randomUUID().slice(0, 8)}`,
    pipelineId: pipeline.id,
    status: "pending",
    input,
    stageResults: new Map<string, StageResult>(),
    startedAt: new Date().toISOString(),
  };

  store.addRun(run);

  // Execute the pipeline asynchronously
  const client = createClaudeClient();
  const engine = new PipelineEngine(client);
  engine.execute(pipeline, run).catch(() => {
    run.status = "failed";
    run.completedAt = new Date().toISOString();
  });

  return c.json(store.serializeRun(run), 202);
});

app.get("/pipelines/:id/runs", (c) => {
  const pipeline = store.getPipeline(c.req.param("id"));
  if (!pipeline) {
    return c.json({ error: "Pipeline not found" }, 404);
  }

  const runs = store.listRunsForPipeline(pipeline.id);
  return c.json({ runs: runs.map((r) => store.serializeRun(r)) });
});

app.get("/pipelines/:id/runs/:runId", (c) => {
  const run = store.getRun(c.req.param("runId"));
  if (!run || run.pipelineId !== c.req.param("id")) {
    return c.json({ error: "Run not found" }, 404);
  }

  return c.json(store.serializeRun(run));
});

// ---- SSE Stream ----

app.get("/pipelines/:id/runs/:runId/stream", (c) => {
  const run = store.getRun(c.req.param("runId"));
  if (!run || run.pipelineId !== c.req.param("id")) {
    return c.json({ error: "Run not found" }, 404);
  }

  const pipeline = store.getPipeline(c.req.param("id"));
  if (!pipeline) {
    return c.json({ error: "Pipeline not found" }, 404);
  }

  // If the run is already completed or failed, return the final state
  if (run.status === "completed" || run.status === "failed") {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: `pipeline:${run.status}`,
        data: JSON.stringify(store.serializeRun(run)),
      });
    });
  }

  // For pending/running, start a new execution and stream events
  return streamSSE(c, async (stream) => {
    const events: SSEEvent[] = [];
    const client = createClaudeClient();
    const engine = new PipelineEngine(client);

    await engine.execute(pipeline, run, (event) => {
      events.push(event);
    });

    for (const event of events) {
      await stream.writeSSE({
        event: event.event,
        data: JSON.stringify(event.data),
      });
    }

    await stream.writeSSE({
      event: "done",
      data: JSON.stringify(store.serializeRun(run)),
    });
  });
});

export default app;
export { app };
