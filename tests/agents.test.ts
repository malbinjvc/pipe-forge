import { describe, test, expect, mock, beforeEach } from "bun:test";
import { ExtractorAgent } from "../src/agents/extractor.ts";
import { TransformerAgent } from "../src/agents/transformer.ts";
import { ValidatorAgent } from "../src/agents/validator.ts";
import { SummarizerAgent } from "../src/agents/summarizer.ts";
import type { ClaudeClient } from "../src/services/claude-client.ts";

function createMockClient(response: string): ClaudeClient {
  return {
    sendMessage: mock(() => Promise.resolve(response)),
  } as unknown as ClaudeClient;
}

describe("ExtractorAgent", () => {
  test("has correct type and name", () => {
    const client = createMockClient("{}");
    const agent = new ExtractorAgent(client);
    expect(agent.type).toBe("extractor");
    expect(agent.name).toBe("Data Extractor");
  });

  test("processes input through Claude client", async () => {
    const mockResponse = JSON.stringify({ entities: ["John", "Jane"] });
    const client = createMockClient(mockResponse);
    const agent = new ExtractorAgent(client);

    const result = await agent.process("Find names in this text");

    expect(client.sendMessage).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ entities: ["John", "Jane"] });
  });

  test("passes custom prompt in config", async () => {
    const client = createMockClient('"extracted"');
    const agent = new ExtractorAgent(client);

    await agent.process("data", { prompt: "Extract emails" });

    const mockFn = client.sendMessage as unknown as { mock: { calls: unknown[][] } };
    const callArgs = mockFn.mock.calls[0]! as [string, string];
    expect(callArgs[0]).toContain("Extract emails");
  });

  test("returns raw string if response is not valid JSON", async () => {
    const client = createMockClient("This is just plain text");
    const agent = new ExtractorAgent(client);

    const result = await agent.process("input");
    expect(result).toBe("This is just plain text");
  });
});

describe("TransformerAgent", () => {
  test("has correct type", () => {
    const client = createMockClient("{}");
    const agent = new TransformerAgent(client);
    expect(agent.type).toBe("transformer");
    expect(agent.name).toBe("Data Transformer");
  });

  test("processes and transforms data", async () => {
    const mockResponse = JSON.stringify({ transformed: true, data: [1, 2, 3] });
    const client = createMockClient(mockResponse);
    const agent = new TransformerAgent(client);

    const result = await agent.process({ raw: "data" });
    expect(result).toEqual({ transformed: true, data: [1, 2, 3] });
  });
});

describe("ValidatorAgent", () => {
  test("has correct type", () => {
    const client = createMockClient("{}");
    const agent = new ValidatorAgent(client);
    expect(agent.type).toBe("validator");
    expect(agent.name).toBe("Data Validator");
  });

  test("validates data and returns validation result", async () => {
    const mockResponse = JSON.stringify({
      valid: true,
      errors: [],
      warnings: [],
      data: { name: "test" },
    });
    const client = createMockClient(mockResponse);
    const agent = new ValidatorAgent(client);

    const result = (await agent.process({ name: "test" })) as {
      valid: boolean;
      errors: string[];
    };
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe("SummarizerAgent", () => {
  test("has correct type", () => {
    const client = createMockClient("{}");
    const agent = new SummarizerAgent(client);
    expect(agent.type).toBe("summarizer");
    expect(agent.name).toBe("Data Summarizer");
  });

  test("summarizes data", async () => {
    const mockResponse = JSON.stringify({
      summary: "This is a summary",
      keyPoints: ["point1", "point2"],
      metadata: {},
    });
    const client = createMockClient(mockResponse);
    const agent = new SummarizerAgent(client);

    const result = (await agent.process("long text")) as {
      summary: string;
      keyPoints: string[];
    };
    expect(result.summary).toBe("This is a summary");
    expect(result.keyPoints.length).toBe(2);
  });
});
