// ---- Agent Types ----

export type AgentType = "extractor" | "transformer" | "validator" | "summarizer";

export interface AgentInfo {
  type: AgentType;
  name: string;
  description: string;
}

// ---- Stage Types ----

export type StageStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface StageDefinition {
  id: string;
  type: AgentType;
  config?: StageConfig;
  dependsOn?: string[];
}

export interface StageConfig {
  prompt?: string;
  retryCount?: number;
  retryDelayMs?: number;
  timeout?: number;
}

export interface StageResult {
  stageId: string;
  status: StageStatus;
  output?: unknown;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  retries: number;
}

// ---- Pipeline Types ----

export type PipelineStatus = "pending" | "running" | "completed" | "failed";

export interface PipelineDefinition {
  id: string;
  name: string;
  stages: StageDefinition[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatePipelineInput {
  name: string;
  stages: StageDefinition[];
}

export interface PipelineRun {
  id: string;
  pipelineId: string;
  status: PipelineStatus;
  input: unknown;
  stageResults: Map<string, StageResult>;
  startedAt: string;
  completedAt?: string;
  checkpointId?: string;
}

export interface PipelineRunSerialized {
  id: string;
  pipelineId: string;
  status: PipelineStatus;
  input: unknown;
  stageResults: Record<string, StageResult>;
  startedAt: string;
  completedAt?: string;
  checkpointId?: string;
}

// ---- Checkpoint Types ----

export interface Checkpoint {
  id: string;
  runId: string;
  pipelineId: string;
  stageResults: Record<string, StageResult>;
  savedAt: string;
}

// ---- Claude API Types ----

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ClaudeRequest {
  model: string;
  max_tokens: number;
  messages: ClaudeMessage[];
  system?: string;
}

export interface ClaudeContentBlock {
  type: "text";
  text: string;
}

export interface ClaudeResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: ClaudeContentBlock[];
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// ---- SSE Types ----

export interface SSEEvent {
  event: string;
  data: unknown;
}

// ---- Stats ----

export interface SystemStats {
  totalPipelines: number;
  totalRuns: number;
  runsByStatus: Record<string, number>;
  totalCheckpoints: number;
  uptime: number;
}

// ---- Retry Options ----

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}
