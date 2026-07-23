import { useEffect, useState } from "react";
import type { ApprovalRequest } from "../types.ts";

interface ApprovalCardProps {
  request: ApprovalRequest;
  onRespond: (id: string, response: { value?: string; confirmed?: boolean; cancelled?: boolean }) => void;
}

function isBlockOption(option: string): boolean {
  const lower = option.toLowerCase();
  return lower === "block" || lower === "deny" || lower === "no" || lower === "cancel";
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "Expired";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `Expires in ${m}m ${s.toString().padStart(2, "0")}s` : `Expires in ${s}s`;
}

export function ApprovalCard({ request, onRespond }: ApprovalCardProps) {
  const title = request.title ?? "Approval required";
  const message = "message" in request ? request.message : undefined;
  const options = request.method === "select" && "options" in request ? request.options : undefined;
  const timeoutSec = request.timeout ? Math.max(0, Math.ceil(request.timeout / 1000)) : 0;

  const [remaining, setRemaining] = useState(timeoutSec);

  useEffect(() => {
    if (timeoutSec <= 0) {
      setRemaining(0);
      return;
    }
    setRemaining(timeoutSec);
    const interval = setInterval(() => {
      setRemaining((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(interval);
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timeoutSec]);

  return (
    <div className="approval-card" role="alertdialog" aria-label={title}>
      <div className="approval-title">{title}</div>
      {message && <div className="approval-message">{message}</div>}
      <div className="approval-actions">
        {options?.map((option) => (
          <button
            key={option}
            type="button"
            className={isBlockOption(option) ? "approval-deny" : undefined}
            onClick={() => onRespond(request.id, { value: option })}
          >
            {option}
          </button>
        ))}
        {request.method === "confirm" && (
          <>
            <button type="button" onClick={() => onRespond(request.id, { confirmed: true })}>Allow</button>
            <button type="button" className="approval-deny" onClick={() => onRespond(request.id, { confirmed: false })}>Block</button>
          </>
        )}
        {request.method !== "select" && request.method !== "confirm" && (
          <button type="button" className="approval-deny" onClick={() => onRespond(request.id, { cancelled: true })}>Dismiss</button>
        )}
      </div>
      {timeoutSec > 0 && (
        <div className="approval-timeout">{formatCountdown(remaining)}</div>
      )}
    </div>
  );
}
