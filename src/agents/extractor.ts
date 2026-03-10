import type { ClaudeClient } from "../services/claude-client.ts";
import type { AgentType, StageConfig } from "../types.ts";
import { BaseAgent } from "./base.ts";

export class ExtractorAgent extends BaseAgent {
  readonly type: AgentType = "extractor";
  readonly name = "Data Extractor";
  readonly description = "Extracts structured data, entities, and key information from raw input";

  constructor(client: ClaudeClient) {
    super(client);
  }

  protected buildSystemPrompt(_config?: StageConfig): string {
    return `You are a data extraction specialist. Your job is to extract structured data from the provided input.
Always respond with valid JSON containing the extracted data.
Focus on identifying key entities, relationships, and important data points.
If the input is unstructured text, extract relevant fields into a clean JSON structure.`;
  }
}
