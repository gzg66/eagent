import { useState } from "react";
import type { AssistantMessage as AssistantMessageType } from "../types.ts";
import { MarkdownRenderer } from "./MarkdownRenderer.tsx";
import { ToolExecution } from "./ToolExecution.tsx";

interface AssistantMessageProps {
  message: AssistantMessageType;
  toolResults?: Map<string, { result: unknown; isError: boolean }>;
}

export function AssistantMessage({ message, toolResults }: AssistantMessageProps) {
  const content: Array<{ type: string; text?: string; thinking?: string; id?: string; name?: string; arguments?: Record<string, unknown> }> = Array.isArray(message.content) ? message.content : [];
  const hasText = content.some((b) => b.type === "text");
  const [thinkingExpanded, setThinkingExpanded] = useState(!hasText);

  return (
    <div className="message assistant-message">
      <div className="message-header">
        <span className="message-role">Agent</span>
        {message.usage && (
          <span className="message-usage">
            {(message.usage.input ?? message.usage.inputTokens ?? 0) + (message.usage.output ?? message.usage.outputTokens ?? 0)} tokens
          </span>
        )}
        {message.timestamp && (
          <span className="message-time">
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>
      <div className="message-content">
        {content.map((block, index) => {
          if (block.type === "text") {
            return <MarkdownRenderer key={index} text={block.text} />;
          }
          if (block.type === "thinking") {
            return (
              <div key={index} className="thinking-block">
                <button
                  type="button"
                  className="thinking-toggle"
                  onClick={() => setThinkingExpanded(!thinkingExpanded)}
                >
                  {thinkingExpanded ? "▾" : "▸"} Thinking
                </button>
                {thinkingExpanded && (
                  <div className="thinking-content">
                    <MarkdownRenderer text={block.thinking} />
                  </div>
                )}
              </div>
            );
          }
          if (block.type === "toolCall") {
            const result = toolResults?.get(block.id);
            return (
              <ToolExecution
                key={index}
                toolCallId={block.id}
                toolName={block.name}
                args={block.arguments}
                result={result?.result}
                isError={result?.isError ?? false}
                isPartial={!result}
              />
            );
          }
          return null;
        })}
        {message.stopReason && message.stopReason !== "stop" && (
          <div className={`stop-reason stop-reason--${message.stopReason}`}>
            {message.stopReason === "length" && "Response truncated (max tokens reached)"}
            {message.stopReason === "error" && message.errorMessage && `Error: ${message.errorMessage}`}
            {message.stopReason === "aborted" && "Response aborted"}
            {message.stopReason === "toolUse" && null}
          </div>
        )}
      </div>
    </div>
  );
}
