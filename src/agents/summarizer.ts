import type { ClaudeClient } from "../services/claude-client.ts";
import type { AgentType, StageConfig } from "../types.ts";
import { BaseAgent } from "./base.ts";

export class SummarizerAgent extends BaseAgent {
  readonly type: AgentType = "summarizer";
  readonly name = "Data Summarizer";
  readonly description = "Summarizes data, generates reports, and produces concise overviews";

  constructor(client: ClaudeClient) {
    super(client);
  }

  protected buildSystemPrompt(_config?: StageConfig): string {
    return `You are a data summarization specialist. Your job is to create concise, informative summaries of the provided data.
Always respond with valid JSON containing:
- "summary": a concise text summary
- "keyPoints": array of key points
- "metadata": relevant metadata about the summarized data`;
  }
}
