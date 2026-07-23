import { useCallback, useEffect } from "react";
import { ApprovalCard } from "./components/ApprovalCard.tsx";
import { ChatInput } from "./components/ChatInput.tsx";
import { MessageList } from "./components/MessageList.tsx";
import { SessionList } from "./components/SessionList.tsx";
import { TracePanel } from "./components/TaskTracePanel.tsx";
import { useChat } from "./hooks/useChat.ts";
import { useSSE } from "./hooks/useSSE.ts";

export function App() {
  const chat = useChat();

  // Load sessions on mount
  useEffect(() => {
    chat.loadSessions();
  }, []);

  // Connect SSE when session is selected
  useSSE(chat.sessionId, chat.streamCursor, chat.handleEvent);

  const handleCreateAndSelect = useCallback(async () => {
    const id = await chat.createSession();
    if (id) {
      chat.selectSession(id);
    }
  }, [chat.createSession, chat.selectSession]);

  return (
    <div className="app">
      <SessionList
        sessions={chat.sessions}
        activeSessionId={chat.sessionId}
        onSelect={chat.selectSession}
        onCreate={handleCreateAndSelect}
        onDelete={chat.deleteSession}
      />
      <div className="chat-area">
        {chat.approvals.map((request) => (
          <ApprovalCard key={request.id} request={request} onRespond={chat.respondApproval} />
        ))}
        <div className="chat-messages">
          {!chat.sessionId ? (
            <div className="chat-placeholder">
              <h1>Enterprise Agent</h1>
              <p>Create a new session or select an existing one to start chatting.</p>
              <button
                type="button"
                className="chat-placeholder-btn"
                onClick={handleCreateAndSelect}
              >
                New Session
              </button>
            </div>
          ) : (
            <MessageList
              events={chat.messages}
              isStreaming={chat.isStreaming}
            />
          )}
        </div>
        {chat.sessionId && (
          <ChatInput
            onSubmit={chat.sendMessage}
            onStop={chat.abort}
            isStreaming={chat.isStreaming}
            isStopping={chat.isStopping}
            disabled={chat.isStreaming}
          />
        )}
      </div>
      <TracePanel events={chat.messages} />
    </div>
  );
}
