import { useMemo, useState } from "react";
import type { AgentSessionEvent } from "../types.ts";

interface TracePanelProps {
  events: AgentSessionEvent[];
}

export function TracePanel({ events }: TracePanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const traces = useMemo(
    () =>
      events
        .filter((event) => event.type === "trace_event")
        .map((event) => event.event)
        .slice(-25)
        .reverse(),
    [events],
  );

  return (
    <aside className={`trace-panel ${collapsed ? "trace-panel--collapsed" : ""}`}>
      <button
        type="button"
        className="inspector-toggle"
        onClick={() => setCollapsed(!collapsed)}
      >
        Trace
      </button>
      {!collapsed && (
        <div className="inspector-content">
          <h2>Trace</h2>
          {traces.length === 0 && (
            <p className="inspector-empty">No trace events</p>
          )}
          {traces.map((trace, index) => {
            const item = trace as {
              eventId?: string;
              name?: string;
              phase?: string;
              status?: string;
              kind?: string;
            };
            return (
              <div className="trace-row" key={item.eventId ?? index}>
                <span>{item.kind ?? "trace"}</span>
                <strong>{item.name ?? "event"}</strong>
                <small>
                  {item.phase}
                  {item.status ? ` · ${item.status}` : ""}
                </small>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
