import { useEffect, useRef, useCallback } from "react";
import type { AgentSessionEvent } from "./types.ts";

type EventCallback = (event: AgentSessionEvent) => void;

export function useSSE(sessionId: string | null, onEvent: EventCallback) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const onEventRef = useRef<EventCallback>(onEvent);
  onEventRef.current = onEvent;

  const close = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!sessionId) {
      close();
      return;
    }

    close();

    const es = new EventSource(`/api/stream?sessionId=${encodeURIComponent(sessionId)}`);

    // Listen for all agent session event types
    const eventTypes = [
      "agent_start", "agent_end", "agent_settled",
      "turn_start", "turn_end",
      "message_start", "message_update", "message_end",
      "tool_execution_start", "tool_execution_update", "tool_execution_end",
      "queue_update",
      "compaction_start", "compaction_end",
      "entry_appended", "session_info_changed",
      "thinking_level_changed",
      "auto_retry_start", "auto_retry_end",
      "trace_event",
    ];

    for (const eventType of eventTypes) {
      es.addEventListener(eventType, (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          onEventRef.current(data as AgentSessionEvent);
        } catch {
          // ignore parse errors
        }
      });
    }

    es.onerror = () => {
      // EventSource will auto-reconnect; we just log
      console.warn("SSE connection error, will auto-reconnect...");
    };

    eventSourceRef.current = es;

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [sessionId, close]);

  return { close };
}
