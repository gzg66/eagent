import { describe, expect, test } from "vitest";
import type { AgentSessionEvent, AssistantMessage, ToolResultMessage } from "../types.ts";
import { buildDisplayEntries } from "./MessageList.tsx";

describe("buildDisplayEntries", () => {
  test("does not replace an assistant message with a read tool result", () => {
    const toolCallId = "read-skill";
    const assistantMessage: AssistantMessage = {
      role: "assistant",
      content: [
        { type: "text", text: "Reading the skill instructions." },
        {
          type: "toolCall",
          id: toolCallId,
          name: "read",
          arguments: { path: ".eagent/skills/example/SKILL.md" },
        },
      ],
    };
    const toolResultMessage: ToolResultMessage = {
      role: "toolResult",
      toolCallId,
      toolName: "read",
      content: [{ type: "text", text: "SECRET FILE CONTENT" }],
      isError: false,
    };
    const events: AgentSessionEvent[] = [
      { type: "message_start", message: assistantMessage },
      { type: "message_end", message: assistantMessage },
      { type: "tool_execution_start", toolCallId, toolName: "read", args: { path: "SKILL.md" } },
      {
        type: "tool_execution_end",
        toolCallId,
        toolName: "read",
        result: { content: toolResultMessage.content },
        isError: false,
      },
      { type: "message_end", message: toolResultMessage },
    ];

    const entries = buildDisplayEntries(events);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.message).toEqual(assistantMessage);
    expect(entries[0]?.toolResults?.get(toolCallId)).toEqual({
      result: { content: toolResultMessage.content },
      isError: false,
    });
  });
});
