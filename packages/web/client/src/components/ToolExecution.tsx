import { useState } from "react";

interface ToolExecutionProps {
  toolCallId: string;
  toolName: string;
  args: unknown;
  result?: unknown;
  isError: boolean;
  isPartial: boolean;
}

export function ToolExecution({
  toolName,
  args,
  result,
  isError,
  isPartial,
}: ToolExecutionProps) {
  const [expanded, setExpanded] = useState(true);
  const task = getTask(result);

  const stateClass = isPartial ? "tool-pending" : isError ? "tool-error" : "tool-success";

  if (toolName === "read") {
    return (
      <div className={`tool-execution ${stateClass}`}>
        <div className="tool-toggle tool-toggle-static">
          <span className="tool-indicator">
            {isPartial ? "⟳" : isError ? "✗" : "✓"}
          </span>
          <span className="tool-name">read</span>
          <span className="tool-read-path">{formatReadTarget(args)}</span>
          {isPartial && <span className="tool-status">running...</span>}
        </div>
        {isError && result !== undefined && (
          <div className="tool-details">
            <pre className="tool-json tool-json-error">
              {formatJson(result)}
            </pre>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`tool-execution ${stateClass}`}>
      <button
        type="button"
        className="tool-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="tool-indicator">
          {isPartial ? "⟳" : isError ? "✗" : "✓"}
        </span>
        <span className="tool-name">{toolName}</span>
        {isPartial && <span className="tool-status">running...</span>}
      </button>
      {expanded && (
        <div className="tool-details">
          {task && (
            <div className="subagent-card">
              <div><strong>{task.label ?? task.id}</strong><span>{task.status}</span></div>
              <small>Attempt {task.attempt}/{task.maxAttempts}</small>
              {task.result?.summary && <p>{task.result.summary}</p>}
              {task.result?.artifacts?.map((artifact) => (
                <code key={artifact.path}>{artifact.label ?? "artifact"}: {artifact.path}</code>
              ))}
              {task.error && <p className="inspector-error">{task.error}</p>}
            </div>
          )}
          <div className="tool-args">
            <div className="tool-section-label">Arguments</div>
            <pre className="tool-json">
              {formatJson(args)}
            </pre>
          </div>
          {result !== undefined && (
            <div className="tool-result">
              <div className="tool-section-label">Result</div>
              <pre className={`tool-json ${isError ? "tool-json-error" : ""}`}>
                {formatJson(result)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatReadTarget(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const args = value as { path?: unknown; file_path?: unknown; offset?: unknown; limit?: unknown };
  const path = typeof args.file_path === "string" ? args.file_path : typeof args.path === "string" ? args.path : "";
  if (!path) return "";
  if (typeof args.offset !== "number" && typeof args.limit !== "number") return path;
  const startLine = typeof args.offset === "number" ? args.offset : 1;
  const endLine = typeof args.limit === "number" ? startLine + args.limit - 1 : undefined;
  return `${path}:${startLine}${endLine === undefined ? "" : `-${endLine}`}`;
}

interface TaskResultView {
  id: string;
  label?: string;
  status: string;
  attempt: number;
  maxAttempts: number;
  result?: { summary?: string; artifacts?: Array<{ path: string; label?: string }> };
  error?: string;
}

function getTask(value: unknown): TaskResultView | undefined {
  if (!value || typeof value !== "object") return undefined;
  const details = "details" in value ? (value as { details?: unknown }).details : undefined;
  if (!details || typeof details !== "object" || !("task" in details)) return undefined;
  const task = (details as { task?: unknown }).task;
  if (!task || typeof task !== "object" || !("id" in task) || !("status" in task)) return undefined;
  return task as TaskResultView;
}

function formatJson(value: unknown): string {
  try {
    if (typeof value === "string") return value;
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
