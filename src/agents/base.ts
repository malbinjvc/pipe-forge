import type { ClaudeClient } from "../services/claude-client.ts";
import type { AgentType, StageConfig } from "../types.ts";

export abstract class BaseAgent {
  abstract readonly type: AgentType;
  abstract readonly name: string;
  abstract readonly description: string;

  protected client: ClaudeClient;

  constructor(client: ClaudeClient) {
    this.client = client;
  }

  /**
   * Build the system prompt for the agent.
   */
  protected abstract buildSystemPrompt(config?: StageConfig): string;

  /**
   * Build the user message from the input data.
   */
  protected buildUserMessage(input: unknown, config?: StageConfig): string {
    const customPrompt = config?.prompt ? `\n\nAdditional instructions: ${config.prompt}` : "";
    const inputStr = typeof input === "string" ? input : JSON.stringify(input, null, 2);
    return `${inputStr}${customPrompt}`;
  }

  /**
   * Process input data through the agent.
   */
  async process(input: unknown, config?: StageConfig): Promise<unknown> {
    const systemPrompt = this.buildSystemPrompt(config);
    const userMessage = this.buildUserMessage(input, config);
    const response = await this.client.sendMessage(userMessage, systemPrompt);

    return this.parseResponse(response);
  }

  /**
   * Parse the Claude response. Default: try JSON, fallback to string.
   */
  protected parseResponse(response: string): unknown {
    try {
      return JSON.parse(response) as unknown;
    } catch {
      return response;
    }
  }
}
