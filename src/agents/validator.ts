import type { ClaudeClient } from "../services/claude-client.ts";
import type { AgentType, StageConfig } from "../types.ts";
import { BaseAgent } from "./base.ts";

export class ValidatorAgent extends BaseAgent {
  readonly type: AgentType = "validator";
  readonly name = "Data Validator";
  readonly description = "Validates data quality, completeness, and correctness";

  constructor(client: ClaudeClient) {
    super(client);
  }

  protected buildSystemPrompt(_config?: StageConfig): string {
    return `You are a data validation specialist. Your job is to validate the provided data for quality, completeness, and correctness.
Always respond with valid JSON containing:
- "valid": boolean indicating if data passes validation
- "errors": array of any validation errors found
- "warnings": array of any warnings
- "data": the validated (possibly corrected) data`;
  }
}
