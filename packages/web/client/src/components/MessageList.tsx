import { useMemo, useEffect, useRef } from "react";
import type { AgentSessionEvent, AssistantMessage as AssistantMsg, UserMessage as UserMsg } from "../types.ts";
import { UserMessage } from "./UserMessage.tsx";
import { AssistantMessage } from "./AssistantMessage.tsx";

interface MessageListProps {
  events: AgentSessionEvent[];
  isStreaming: boolean;
}

/**
 * Process events into a display-friendly message list.
 *
 * Events flow (mirrors TUI interactive-mode event handling):
 *   message_start(user) → rendered immediately
 *   message_start(assistant) → create placeholder
 *   message_update(assistant) → update content (streaming text/toolCalls)
 *   message_end(assistant) → finalize
 *   tool_execution_start → track tool result in relevant assistant entry
 *   tool_execution_update → update partial result
 *   tool_execution_end → finalize with isError
 */
interface DisplayEntry {
  id: string;
  type: "user" | "assistant";
  message: UserMsg | AssistantMsg;
  toolResults?: Map<string, { result: unknown; isError: boolean }>;
}

export function MessageList({ events, isStreaming }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const entries = useMemo(() => {
    const result: DisplayEntry[] = [];

    for (const event of events) {
      switch (event.type) {
        case "message_start": {
          const msg = event.message;
          if (msg.role === "user") {
            result.push({ id: `msg-${result.length}`, type: "user", message: msg as UserMsg });
          } else if (msg.role === "assistant") {
            result.push({
              id: `msg-${result.length}`,
              type: "assistant",
              message: msg as AssistantMsg,
              toolResults: new Map(),
            });
          }
          break;
        }
        case "message_update": {
          const msg = event.message;
          const lastAssistant = findLast(result, (e) => e.type === "assistant");
          if (lastAssistant && msg.role === "assistant") {
            lastAssistant.message = msg as AssistantMsg;
          }
          break;
        }
        case "message_end": {
          const msg = event.message;
          const lastEntry = findLast(result, (e) =>
            msg.role === "user" ? e.type === "user" : e.type === "assistant",
          );
          if (lastEntry) {
            lastEntry.message = msg as UserMsg | AssistantMsg;
          }
          break;
        }
        case "tool_execution_start": {
          // Find the assistant entry containing this tool call
          for (let i = result.length - 1; i >= 0; i--) {
            const entry = result[i];
            if (entry.type === "assistant") {
              const content = (entry.message as AssistantMsg).content;
              if (Array.isArray(content) && content.some((c) => c.type === "toolCall" && c.id === event.toolCallId)) {
                if (!entry.toolResults) entry.toolResults = new Map();
                entry.toolResults.set(event.toolCallId, { result: undefined, isError: false });
                break;
              }
            }
          }
          break;
        }
        case "tool_execution_update": {
          for (let i = result.length - 1; i >= 0; i--) {
            const entry = result[i];
            if (entry.type === "assistant" && entry.toolResults?.has(event.toolCallId)) {
              entry.toolResults.set(event.toolCallId, {
                result: event.partialResult,
                isError: false,
              });
              break;
            }
          }
          break;
        }
        case "tool_execution_end": {
          for (let i = result.length - 1; i >= 0; i--) {
            const entry = result[i];
            if (entry.type === "assistant" && entry.toolResults?.has(event.toolCallId)) {
              entry.toolResults.set(event.toolCallId, {
                result: event.result,
                isError: event.isError,
              });
              break;
            }
          }
          break;
        }
      }
    }

    return result;
  }, [events]);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length, isStreaming]);

  return (
    <div className="message-list">
      {entries.map((entry) => {
        if (entry.type === "user") {
          const msg = entry.message as UserMsg;
          let text = "";
          if (typeof msg.content === "string") {
            text = msg.content;
          } else if (Array.isArray(msg.content)) {
            text = msg.content
              .filter((c) => c.type === "text")
              .map((c) => c.text ?? "")
              .join("\n");
          }
          return <UserMessage key={entry.id} text={text} timestamp={msg.timestamp} />;
        }

        return (
          <AssistantMessage
            key={entry.id}
            message={entry.message as AssistantMsg}
            toolResults={entry.toolResults}
          />
        );
      })}
      {isStreaming && (
        <div className="streaming-indicator">
          <span className="streaming-dot" />
          Agent is thinking...
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function findLast<T>(arr: T[], predicate: (item: T) => boolean): T | undefined {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) return arr[i];
  }
  return undefined;
}
