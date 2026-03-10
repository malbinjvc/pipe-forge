import { describe, test, expect, beforeEach } from "bun:test";
import app from "../src/app.ts";
import { store } from "../src/services/store.ts";

function req(path: string, options?: RequestInit): Request {
  return new Request(`http://localhost${path}`, options);
}

async function json(path: string, options?: RequestInit) {
  const res = await app.fetch(req(path, options));
  const body = (await res.json()) as Record<string, unknown>;
  return { res, body };
}

describe("Health Check", () => {
  test("GET /health returns ok", async () => {
    const { res, body } = await json("/health");
    expect(res.status).toBe(200);
    expect(body["status"]).toBe("ok");
    expect(body["timestamp"]).toBeDefined();
  });
});

describe("Security Headers", () => {
  test("responses include security headers", async () => {
    const res = await app.fetch(req("/health"));
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-XSS-Protection")).toBe("1; mode=block");
  });
});

describe("Agents", () => {
  test("GET /agents returns available agent types", async () => {
    const { res, body } = await json("/agents");
    expect(res.status).toBe(200);
    const agents = body["agents"] as Array<{ type: string }>;
    expect(agents.length).toBe(4);
    const types = agents.map((a) => a.type);
    expect(types).toContain("extractor");
    expect(types).toContain("transformer");
    expect(types).toContain("validator");
    expect(types).toContain("summarizer");
  });
});

describe("Stats", () => {
  beforeEach(() => {
    store.reset();
  });

  test("GET /stats returns system stats", async () => {
    const { res, body } = await json("/stats");
    expect(res.status).toBe(200);
    expect(body["totalPipelines"]).toBe(0);
    expect(body["totalRuns"]).toBe(0);
    expect(typeof body["uptime"]).toBe("number");
  });
});

describe("Pipeline CRUD", () => {
  beforeEach(() => {
    store.reset();
  });

  test("POST /pipelines creates a pipeline", async () => {
    const { res, body } = await json("/pipelines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Pipeline",
        stages: [
          { id: "extract", type: "extractor" },
          { id: "transform", type: "transformer", dependsOn: ["extract"] },
        ],
      }),
    });

    expect(res.status).toBe(201);
    expect(body["name"]).toBe("Test Pipeline");
    expect(body["id"]).toBeDefined();
    expect((body["stages"] as unknown[]).length).toBe(2);
  });

  test("POST /pipelines rejects empty name", async () => {
    const { res, body } = await json("/pipelines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "",
        stages: [{ id: "a", type: "extractor" }],
      }),
    });

    expect(res.status).toBe(400);
    expect(body["error"]).toBeDefined();
  });

  test("POST /pipelines rejects empty stages", async () => {
    const { res, body } = await json("/pipelines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Bad Pipeline",
        stages: [],
      }),
    });

    expect(res.status).toBe(400);
  });

  test("POST /pipelines rejects invalid stage type", async () => {
    const { res, body } = await json("/pipelines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Bad Pipeline",
        stages: [{ id: "a", type: "invalid_type" }],
      }),
    });

    expect(res.status).toBe(400);
    expect((body["error"] as string)).toContain("Invalid stage type");
  });

  test("POST /pipelines rejects cyclic stages", async () => {
    const { res, body } = await json("/pipelines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Cyclic",
        stages: [
          { id: "a", type: "extractor", dependsOn: ["b"] },
          { id: "b", type: "transformer", dependsOn: ["a"] },
        ],
      }),
    });

    expect(res.status).toBe(400);
    expect((body["error"] as string)).toContain("cycle");
  });

  test("GET /pipelines lists all pipelines", async () => {
    // Create two pipelines
    await app.fetch(
      req("/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "P1",
          stages: [{ id: "a", type: "extractor" }],
        }),
      })
    );
    await app.fetch(
      req("/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "P2",
          stages: [{ id: "b", type: "transformer" }],
        }),
      })
    );

    const { res, body } = await json("/pipelines");
    expect(res.status).toBe(200);
    expect((body["pipelines"] as unknown[]).length).toBe(2);
  });

  test("GET /pipelines/:id returns a specific pipeline", async () => {
    const createRes = await app.fetch(
      req("/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "My Pipeline",
          stages: [{ id: "a", type: "extractor" }],
        }),
      })
    );
    const created = (await createRes.json()) as { id: string };
    const pipelineId = created.id;

    const { res, body } = await json(`/pipelines/${pipelineId}`);
    expect(res.status).toBe(200);
    expect(body["name"]).toBe("My Pipeline");
  });

  test("GET /pipelines/:id returns 404 for unknown pipeline", async () => {
    const { res } = await json("/pipelines/nonexistent");
    expect(res.status).toBe(404);
  });
});

describe("Pipeline Runs", () => {
  beforeEach(() => {
    store.reset();
  });

  test("POST /pipelines/:id/run starts a run", async () => {
    const createRes = await app.fetch(
      req("/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Run Test",
          stages: [{ id: "a", type: "extractor" }],
        }),
      })
    );
    const created = (await createRes.json()) as { id: string };

    const { res, body } = await json(`/pipelines/${created.id}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "input data" }),
    });

    expect(res.status).toBe(202);
    expect(body["id"]).toBeDefined();
    expect(body["pipelineId"]).toBe(created.id);
  });

  test("POST /pipelines/:id/run returns 404 for unknown pipeline", async () => {
    const { res } = await json("/pipelines/nonexistent/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  test("GET /pipelines/:id/runs lists runs", async () => {
    const createRes = await app.fetch(
      req("/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Runs List",
          stages: [{ id: "a", type: "extractor" }],
        }),
      })
    );
    const created = (await createRes.json()) as { id: string };

    // Create a run
    await app.fetch(
      req(`/pipelines/${created.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
    );

    // Allow async execution to start
    await new Promise((r) => setTimeout(r, 50));

    const { res, body } = await json(`/pipelines/${created.id}/runs`);
    expect(res.status).toBe(200);
    expect((body["runs"] as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  test("GET /pipelines/:id/runs/:runId returns 404 for unknown run", async () => {
    const createRes = await app.fetch(
      req("/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "P",
          stages: [{ id: "a", type: "extractor" }],
        }),
      })
    );
    const created = (await createRes.json()) as { id: string };

    const { res } = await json(`/pipelines/${created.id}/runs/nonexistent`);
    expect(res.status).toBe(404);
  });
});

describe("Invalid JSON", () => {
  test("POST /pipelines with invalid JSON returns 400", async () => {
    const res = await app.fetch(
      req("/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      })
    );
    expect(res.status).toBe(400);
  });
});
