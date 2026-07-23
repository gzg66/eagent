import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ChatInput,
  getChatInputAction,
} from "./ChatInput.tsx";
import { TracePanel } from "./TaskTracePanel.tsx";
import { createInitialChatState } from "../hooks/useChat.ts";

describe("Web session and stop UI", () => {
  it("starts with no selected session", () => {
    expect(createInitialChatState().sessionId).toBeNull();
  });

  it("switches the send action to Stop and Stopping", () => {
    expect(getChatInputAction(true, false)).toEqual({
      label: "Stop",
      disabled: false,
    });
    expect(getChatInputAction(true, true)).toEqual({
      label: "Stopping...",
      disabled: true,
    });

    const html = renderToStaticMarkup(
      <ChatInput
        onSubmit={() => undefined}
        onStop={() => undefined}
        isStreaming
        disabled
      />,
    );
    expect(html).toContain(">Stop<");
    expect(html).not.toContain(">Send<");
  });

  it("renders a Trace-only inspector and contains no task polling", () => {
    const html = renderToStaticMarkup(<TracePanel events={[]} />);
    expect(html).toContain("Trace");
    expect(html).not.toContain("Tasks");

    const source = readFileSync(
      fileURLToPath(
        new URL(
          "./TaskTracePanel.tsx",
          import.meta.url,
        ),
      ),
      "utf8",
    );
    expect(source).not.toContain("/api/tasks");
  });
});
