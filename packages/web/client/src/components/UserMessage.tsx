import { MarkdownRenderer } from "./MarkdownRenderer.tsx";

interface UserMessageProps {
  text: string;
  timestamp?: number;
}

export function UserMessage({ text, timestamp }: UserMessageProps) {
  return (
    <div className="message user-message">
      <div className="message-header">
        <span className="message-role">You</span>
        {timestamp && (
          <span className="message-time">
            {new Date(timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>
      <div className="message-content">
        <MarkdownRenderer text={text} />
      </div>
    </div>
  );
}
