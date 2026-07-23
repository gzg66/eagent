import { useCallback, useRef, useState } from "react";
import type {
  AgentSessionEvent,
  ApprovalRequest,
  SessionHistory,
  SessionInfo,
  WebStreamEvent,
} from "../types.ts";

export interface ChatState {
  messages: AgentSessionEvent[];
  isStreaming: boolean;
  isStopping: boolean;
  sessionId: string | null;
  sessions: SessionInfo[];
  approvals: ApprovalRequest[];
  cursor: number;
  streamCursor: number;
}

export function createInitialChatState(): ChatState {
  return {
    messages: [],
    isStreaming: false,
    isStopping: false,
    sessionId: null,
    sessions: [],
    approvals: [],
    cursor: 0,
    streamCursor: 0,
  };
}

export function useChat() {
  const [state, setState] = useState<ChatState>(createInitialChatState);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectionVersionRef = useRef(0);

  const clearSafetyTimer = useCallback(() => {
    if (!safetyTimerRef.current) return;
    clearTimeout(safetyTimerRef.current);
    safetyTimerRef.current = null;
  }, []);

  const handleEvent = useCallback(
    (event: WebStreamEvent, cursor: number) => {
      setState((previous) => {
        if (cursor > 0 && cursor <= previous.cursor) return previous;
        if (event.type === "approval_request") {
          return {
            ...previous,
            cursor: Math.max(previous.cursor, cursor),
            approvals: [
              ...previous.approvals.filter((item) => item.id !== event.request.id),
              event.request,
            ],
          };
        }

        let isStreaming = previous.isStreaming;
        let isStopping = previous.isStopping;
        switch (event.type) {
          case "agent_start":
          case "turn_start":
            isStreaming = true;
            break;
          case "agent_end":
          case "agent_settled":
            isStreaming = false;
            isStopping = false;
            clearSafetyTimer();
            break;
          case "trace_event": {
            const trace = event.event as
              | { name?: string; phase?: string; status?: string }
              | undefined;
            if (
              trace?.name === "agent.session.turn" &&
              trace.phase === "end" &&
              trace.status === "error"
            ) {
              isStreaming = false;
              isStopping = false;
              clearSafetyTimer();
            }
            break;
          }
        }

        let sessions = previous.sessions;
        if (event.type === "message_end" && event.message.role === "user") {
          const content = event.message.content;
          const label = (
            typeof content === "string"
              ? content
              : content
                  .filter((part) => part.type === "text")
                  .map((part) => part.text)
                  .join("\n")
          )
            .trim()
            .slice(0, 80);
          if (label) {
            sessions = sessions.map((session) =>
              session.id === previous.sessionId &&
              session.label.startsWith("Session ")
                ? { ...session, label, lastActivityAt: Date.now() }
                : session,
            );
          }
        }

        return {
          ...previous,
          sessions,
          messages: [...previous.messages, event],
          isStreaming,
          isStopping,
          cursor: Math.max(previous.cursor, cursor),
        };
      });
    },
    [clearSafetyTimer],
  );

  const loadSessions = useCallback(async () => {
    try {
      const response = await fetch("/api/sessions");
      if (!response.ok) return [];
      const data = (await response.json()) as { sessions: SessionInfo[] };
      const sessions = data.sessions ?? [];
      setState((previous) => ({ ...previous, sessions }));
      return sessions;
    } catch {
      return [];
    }
  }, []);

  const createSession = useCallback(async (): Promise<string | null> => {
    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) return null;
      const session = (await response.json()) as SessionInfo;
      setState((previous) => ({
        ...previous,
        sessions: [session, ...previous.sessions],
      }));
      return session.id;
    } catch (error) {
      console.error("Failed to create session:", error);
      return null;
    }
  }, []);

  const selectSession = useCallback(
    async (sessionId: string) => {
      const selectionVersion = ++selectionVersionRef.current;
      clearSafetyTimer();
      setState((previous) => ({
        ...previous,
        sessionId: null,
        messages: [],
        isStreaming: false,
        isStopping: false,
        approvals: [],
        cursor: 0,
        streamCursor: 0,
      }));
      try {
        const response = await fetch(
          `/api/sessions/${encodeURIComponent(sessionId)}/history`,
        );
        if (!response.ok) throw new Error(`History request failed: ${response.status}`);
        const history = (await response.json()) as SessionHistory;
        if (selectionVersion !== selectionVersionRef.current) return;
        setState((previous) => ({
          ...previous,
          sessionId,
          messages: history.events,
          isStreaming: history.isStreaming,
          isStopping: false,
          approvals: [],
          cursor: history.cursor,
          streamCursor: history.cursor,
        }));
      } catch (error) {
        if (selectionVersion !== selectionVersionRef.current) return;
        console.error("Failed to load session history:", error);
        setState((previous) => ({
          ...previous,
          sessionId,
          messages: [],
          cursor: 0,
          streamCursor: 0,
        }));
      }
    },
    [clearSafetyTimer],
  );

  const sendMessage = useCallback(
    async (message: string) => {
      let sessionId = state.sessionId;
      if (!sessionId) {
        sessionId = await createSession();
        if (!sessionId) return;
        await selectSession(sessionId);
      }

      clearSafetyTimer();
      safetyTimerRef.current = setTimeout(() => {
        setState((previous) =>
          previous.isStreaming
            ? { ...previous, isStreaming: false, isStopping: false }
            : previous,
        );
      }, 90_000);
      setState((previous) => ({
        ...previous,
        sessionId,
        isStreaming: true,
        isStopping: false,
      }));

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, message }),
        });
        if (!response.ok) throw new Error(`Chat request failed: ${response.status}`);
      } catch (error) {
        console.error("Failed to send message:", error);
        clearSafetyTimer();
        setState((previous) => ({
          ...previous,
          isStreaming: false,
          isStopping: false,
        }));
      }
    },
    [
      state.sessionId,
      createSession,
      selectSession,
      clearSafetyTimer,
    ],
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(sessionId)}`,
        { method: "DELETE" },
      );
      if (!response.ok && response.status !== 404) return;
      if (state.sessionId === sessionId) {
        selectionVersionRef.current++;
        clearSafetyTimer();
      }
      setState((previous) => ({
        ...previous,
        sessions: previous.sessions.filter((session) => session.id !== sessionId),
        sessionId: previous.sessionId === sessionId ? null : previous.sessionId,
        messages: previous.sessionId === sessionId ? [] : previous.messages,
        isStreaming: previous.sessionId === sessionId ? false : previous.isStreaming,
        isStopping: previous.sessionId === sessionId ? false : previous.isStopping,
        cursor: previous.sessionId === sessionId ? 0 : previous.cursor,
        streamCursor: previous.sessionId === sessionId ? 0 : previous.streamCursor,
      }));
    },
    [state.sessionId, clearSafetyTimer],
  );

  const abort = useCallback(async () => {
    const sessionId = state.sessionId;
    if (!sessionId || !state.isStreaming || state.isStopping) return;
    clearSafetyTimer();
    setState((previous) => ({ ...previous, isStopping: true }));
    try {
      const response = await fetch(
        `/api/chat/${encodeURIComponent(sessionId)}/abort`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error(`Abort request failed: ${response.status}`);
    } catch (error) {
      console.error("Failed to stop current turn:", error);
      setState((previous) => ({ ...previous, isStopping: false }));
    }
  }, [
    state.sessionId,
    state.isStreaming,
    state.isStopping,
    clearSafetyTimer,
  ]);

  const respondApproval = useCallback(
    async (
      id: string,
      response: {
        value?: string;
        confirmed?: boolean;
        cancelled?: boolean;
      },
    ) => {
      const sessionId = state.sessionId;
      if (!sessionId) return;
      const result = await fetch(
        `/api/approval/${encodeURIComponent(sessionId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...response }),
        },
      );
      if (result.ok) {
        setState((previous) => ({
          ...previous,
          approvals: previous.approvals.filter((item) => item.id !== id),
        }));
      }
    },
    [state.sessionId],
  );

  return {
    ...state,
    handleEvent,
    loadSessions,
    createSession,
    selectSession,
    sendMessage,
    deleteSession,
    abort,
    respondApproval,
  };
}
