import type { ClaudeRequest, ClaudeResponse } from "../types.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_MAX_TOKENS = 4096;

export class ClaudeClient {
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey ?? process.env["ANTHROPIC_API_KEY"] ?? "";
    this.model = model ?? DEFAULT_MODEL;
  }

  async sendMessage(
    userMessage: string,
    systemPrompt?: string
  ): Promise<string> {
    if (!this.apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Please set it as an environment variable."
      );
    }

    const request: ClaudeRequest = {
      model: this.model,
      max_tokens: DEFAULT_MAX_TOKENS,
      messages: [{ role: "user", content: userMessage }],
    };

    if (systemPrompt) {
      request.system = systemPrompt;
    }

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Claude API error (${response.status}): ${errorText}`
      );
    }

    const data = (await response.json()) as ClaudeResponse;
    const firstBlock = data.content[0];
    if (!firstBlock || firstBlock.type !== "text") {
      throw new Error("Unexpected Claude API response format");
    }
    return firstBlock.text;
  }
}

export function createClaudeClient(
  apiKey?: string,
  model?: string
): ClaudeClient {
  return new ClaudeClient(apiKey, model);
}
