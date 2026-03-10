import type { ClaudeClient } from "../services/claude-client.ts";
import type { AgentType, StageConfig } from "../types.ts";
import { BaseAgent } from "./base.ts";

export class TransformerAgent extends BaseAgent {
  readonly type: AgentType = "transformer";
  readonly name = "Data Transformer";
  readonly description = "Transforms, restructures, and enriches data between formats";

  constructor(client: ClaudeClient) {
    super(client);
  }

  protected buildSystemPrompt(_config?: StageConfig): string {
    return `You are a data transformation specialist. Your job is to transform, restructure, and enrich the provided data.
Always respond with valid JSON containing the transformed data.
Apply normalization, restructuring, and enrichment as appropriate.
Maintain data integrity while improving structure and consistency.`;
  }
}
