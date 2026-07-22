import type { SessionInfo } from "../types.ts";

interface SessionListProps {
  sessions: SessionInfo[];
  activeSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onCreate: () => void;
  onDelete: (sessionId: string) => void;
}

export function SessionList({
  sessions,
  activeSessionId,
  onSelect,
  onCreate,
  onDelete,
}: SessionListProps) {
  return (
    <div className="session-list">
      <div className="session-list-header">
        <h2>Sessions</h2>
        <button type="button" className="session-new-btn" onClick={onCreate}>
          + New
        </button>
      </div>
      <div className="session-items">
        {sessions.map((s) => (
          <div
            key={s.id}
            className={`session-item ${s.id === activeSessionId ? "session-item--active" : ""}`}
            onClick={() => onSelect(s.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSelect(s.id);
            }}
            role="button"
            tabIndex={0}
          >
            <span className="session-label">{s.label}</span>
            <button
              type="button"
              className="session-delete-btn"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(s.id);
              }}
              title="Delete session"
            >
              ×
            </button>
          </div>
        ))}
        {sessions.length === 0 && (
          <div className="session-empty">No sessions yet</div>
        )}
      </div>
    </div>
  );
}
