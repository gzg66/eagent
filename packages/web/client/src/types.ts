// ============================================================================
// Client-side type definitions — subset of AgentSessionEvent + Message types
// that the Web UI receives over SSE. These mirror the server-side types from
// @enterprise-agent/coding-agent but are self-contained to avoid bundling
// Node.js dependencies.
// ============================================================================

// --- Content blocks ---

export interface TextContent {
  type: "text";
  text: string;
}

export interface ThinkingContent {
  type: "thinking";
  thinking: string;
}

export interface ToolCall {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ImageContent {
  type: "image";
  source: { type: "base64"; data: string; mediaType: string };
}

// --- Messages ---

export interface UserMessage {
  role: "user";
  content: string | (TextContent | ImageContent)[];
  timestamp?: number;
}

export interface AssistantMessage {
  role: "assistant";
  content: (TextContent | ThinkingContent | ToolCall)[];
  stopReason?: "stop" | "length" | "toolUse" | "error" | "aborted";
  errorMessage?: string;
  usage?: {
    input?: number;
    inputTokens?: number;
    output?: number;
    outputTokens?: number;
    cacheRead?: number;
    cacheWrite?: number;
    reasoning?: number;
    totalTokens?: number;
  };
  timestamp?: number;
  api?: string;
  provider?: string;
  model?: string;
  responseId?: string;
}

export interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: (TextContent | ImageContent)[];
  details?: unknown;
  isError: boolean;
  timestamp?: number;
}

export type Message = UserMessage | AssistantMessage | ToolResultMessage;

// --- AgentSessionEvent (subset used by Web UI) ---

export type AgentSessionEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; messages: Message[]; willRetry: boolean }
  | { type: "agent_settled" }
  | { type: "turn_start" }
  | { type: "turn_end"; message: Message }
  | { type: "message_start"; message: Message }
  | { type: "message_update"; message: Message; assistantMessageEvent?: unknown }
  | { type: "message_end"; message: Message }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool_execution_update"; toolCallId: string; toolName: string; args: unknown; partialResult: unknown }
  | { type: "tool_execution_end"; toolCallId: string; toolName: string; result: unknown; isError: boolean }
  | { type: "queue_update"; steering: readonly string[]; followUp: readonly string[] }
  | { type: "compaction_start"; reason: string }
  | { type: "compaction_end"; reason: string; result?: unknown; aborted: boolean; willRetry: boolean; errorMessage?: string }
  | { type: "entry_appended"; entry: unknown }
  | { type: "session_info_changed"; name: string | undefined }
  | { type: "thinking_level_changed"; level: unknown }
  | { type: "trace_event"; event: unknown }
  | { type: "auto_retry_start"; attempt: number; maxAttempts: number; delayMs: number; errorMessage: string }
  | { type: "auto_retry_end"; success: boolean; attempt: number; finalError?: string };

export type ApprovalRequest =
  | { type: "extension_ui_request"; id: string; method: "select"; title: string; options: string[]; timeout?: number }
  | { type: "extension_ui_request"; id: string; method: "confirm"; title: string; message: string; timeout?: number }
  | { type: "extension_ui_request"; id: string; method: "input"; title: string; placeholder?: string; timeout?: number }
  | { type: "extension_ui_request"; id: string; method: string; title?: string; message?: string };

export type WebStreamEvent = AgentSessionEvent | { type: "approval_request"; request: ApprovalRequest };

// --- Session ---

export interface SessionInfo {
  id: string;
  label: string;
  createdAt: number;
  lastActivityAt: number;
}
