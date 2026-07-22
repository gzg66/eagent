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

  const stateClass = isPartial ? "tool-pending" : isError ? "tool-error" : "tool-success";

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

function formatJson(value: unknown): string {
  try {
    if (typeof value === "string") return value;
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
