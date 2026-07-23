import type { ApprovalRequest } from "../types.ts";

interface ApprovalCardProps {
  request: ApprovalRequest;
  onRespond: (id: string, response: { value?: string; confirmed?: boolean; cancelled?: boolean }) => void;
}

export function ApprovalCard({ request, onRespond }: ApprovalCardProps) {
  const title = request.title ?? "Approval required";
  const message = "message" in request ? request.message : undefined;
  const options = request.method === "select" && "options" in request ? request.options : undefined;

  return (
    <div className="approval-card" role="alertdialog" aria-label={title}>
      <div className="approval-title">{title}</div>
      {message && <div className="approval-message">{message}</div>}
      <div className="approval-actions">
        {options?.map((option) => (
          <button key={option} type="button" onClick={() => onRespond(request.id, { value: option })}>
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
    </div>
  );
}
