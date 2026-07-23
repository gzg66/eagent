import { useState, useRef, type FormEvent, type KeyboardEvent } from "react";

interface ChatInputProps {
  onSubmit: (message: string) => void;
  onStop: () => void;
  isStreaming?: boolean;
  isStopping?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function getChatInputAction(
  isStreaming: boolean,
  isStopping: boolean,
): { label: "Send" | "Stop" | "Stopping..."; disabled: boolean } {
  if (!isStreaming) return { label: "Send", disabled: false };
  return isStopping
    ? { label: "Stopping...", disabled: true }
    : { label: "Stop", disabled: false };
}

export function ChatInput({
  onSubmit,
  onStop,
  isStreaming = false,
  isStopping = false,
  disabled = false,
  placeholder = "Type a message...",
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const action = getChatInputAction(isStreaming, isStopping);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form className="chat-input-container" onSubmit={handleSubmit}>
      <textarea
        ref={textareaRef}
        className="chat-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        autoFocus
      />
      {isStreaming ? (
        <button
          type="button"
          className="chat-send-btn chat-stop-btn"
          disabled={action.disabled}
          onClick={onStop}
        >
          {action.label}
        </button>
      ) : (
        <button
          type="submit"
          className="chat-send-btn"
          disabled={disabled || !value.trim()}
        >
          Send
        </button>
      )}
    </form>
  );
}
