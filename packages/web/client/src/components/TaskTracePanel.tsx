import { useEffect, useMemo, useState } from "react";
import type { AgentSessionEvent } from "../types.ts";

interface TaskInfo {
  id: string;
  label?: string;
  status: string;
  attempt: number;
  maxAttempts: number;
  result?: { summary: string; artifacts: Array<{ path: string; label?: string }> };
  error?: string;
}

interface TaskTracePanelProps {
  events: AgentSessionEvent[];
}

export function TaskTracePanel({ events }: TaskTracePanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const traces = useMemo(
    () => events.filter((event) => event.type === "trace_event").map((event) => event.event).slice(-25).reverse(),
    [events],
  );

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/tasks");
        if (!response.ok) return;
        const data = await response.json() as { tasks?: TaskInfo[] };
        if (active) setTasks(data.tasks ?? []);
      } catch {
        // The daemon may still be starting; the next poll retries.
      }
    };
    void load();
    const timer = setInterval(load, 1_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <aside className={`task-trace-panel ${collapsed ? "task-trace-panel--collapsed" : ""}`}>
      <button type="button" className="inspector-toggle" onClick={() => setCollapsed(!collapsed)}>
        {collapsed ? "Tasks" : "Tasks and Trace"}
      </button>
      {!collapsed && (
        <div className="inspector-content">
          <section>
            <h2>Tasks</h2>
            {tasks.length === 0 && <p className="inspector-empty">No tasks</p>}
            {tasks.map((task) => (
              <details key={task.id} className={`inspector-task inspector-task--${task.status}`} open={task.status === "running"}>
                <summary>{task.label ?? task.id.slice(0, 8)} <span>{task.status}</span></summary>
                <div>Attempt {task.attempt}/{task.maxAttempts}</div>
                {task.result?.summary && <p>{task.result.summary}</p>}
                {task.result?.artifacts.map((artifact) => <code key={artifact.path}>{artifact.label ?? "artifact"}: {artifact.path}</code>)}
                {task.error && <p className="inspector-error">{task.error}</p>}
              </details>
            ))}
          </section>
          <section>
            <h2>Trace</h2>
            {traces.length === 0 && <p className="inspector-empty">No trace events</p>}
            {traces.map((trace, index) => {
              const item = trace as { eventId?: string; name?: string; phase?: string; status?: string; kind?: string };
              return (
                <div className="trace-row" key={item.eventId ?? index}>
                  <span>{item.kind ?? "trace"}</span>
                  <strong>{item.name ?? "event"}</strong>
                  <small>{item.phase}{item.status ? ` · ${item.status}` : ""}</small>
                </div>
              );
            })}
          </section>
        </div>
      )}
    </aside>
  );
}
