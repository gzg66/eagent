import { Type } from "typebox";
import { afterEach, describe, expect, it, vi } from "vitest";
import { streamSimple } from "../src/api/google-generative-ai.ts";
import type { AssistantMessage, Context, Model, ToolResultMessage } from "../src/types.ts";

const model: Model<"google-generative-ai"> = {
	id: "gemini-3.5-flash",
	name: "Gemini 3.5 Flash",
	api: "google-generative-ai",
	provider: "google",
	baseUrl: "https://generativelanguage.googleapis.com/v1beta",
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 1_048_576,
	maxTokens: 65_536,
};

const readTool = {
	name: "read",
	description: "Read a file",
	parameters: Type.Object({ path: Type.String() }),
};

function sseResponse(chunks: unknown[]): Response {
	const body = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("");
	return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("google-generative-ai thinking", () => {
	it("streams thought summaries and replays thought signatures through a tool round trip", async () => {
		const signature = "dGhvdWdodC1zaWduYXR1cmU=";
		const payloads: Array<Record<string, unknown>> = [];
		const responses = [
			sseResponse([
				{
					responseId: "first",
					candidates: [
						{
							content: {
								parts: [
									{ thought: true, text: "I should inspect the file.", thoughtSignature: signature },
									{
										functionCall: { name: "read", args: { path: "README.md" } },
										thoughtSignature: signature,
									},
								],
							},
							finishReason: "STOP",
						},
					],
					usageMetadata: {
						promptTokenCount: 10,
						candidatesTokenCount: 2,
						thoughtsTokenCount: 4,
						totalTokenCount: 16,
					},
				},
			]),
			sseResponse([
				{
					responseId: "second",
					candidates: [{ content: { parts: [{ text: "The file says hello." }] }, finishReason: "STOP" }],
				},
			]),
		];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
				payloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
				const response = responses.shift();
				if (!response) throw new Error("Unexpected request");
				return response;
			}),
		);

		const first = await streamSimple(
			model,
			{
				messages: [{ role: "user", content: "Read README", timestamp: 0 }],
				tools: [readTool],
			},
			{ apiKey: "test-key", reasoning: "high" },
		).result();
		const toolCall = first.content.find((block) => block.type === "toolCall");
		expect(first.content[0]).toMatchObject({
			type: "thinking",
			thinking: "I should inspect the file.",
			thinkingSignature: signature,
		});
		expect(toolCall).toMatchObject({ type: "toolCall", name: "read", thoughtSignature: signature });
		expect(first.usage.reasoning).toBe(4);
		expect(payloads[0]).toMatchObject({
			generationConfig: { thinkingConfig: { includeThoughts: true, thinkingLevel: "HIGH" } },
		});

		const toolResult: ToolResultMessage = {
			role: "toolResult",
			toolCallId: toolCall?.type === "toolCall" ? toolCall.id : "",
			toolName: "read",
			content: [{ type: "text", text: "hello" }],
			isError: false,
			timestamp: 1,
		};
		const secondContext: Context = {
			messages: [first as AssistantMessage, toolResult],
			tools: [readTool],
		};
		const second = await streamSimple(model, secondContext, {
			apiKey: "test-key",
			reasoning: "high",
		}).result();

		expect(payloads[1]).toMatchObject({
			contents: [
				{
					role: "model",
					parts: [
						{ thought: true, text: "I should inspect the file.", thoughtSignature: signature },
						{
							functionCall: { name: "read", args: { path: "README.md" } },
							thoughtSignature: signature,
						},
					],
				},
				{
					role: "user",
					parts: [{ functionResponse: { name: "read", response: { output: "hello" } } }],
				},
			],
		});
		expect(second.content).toEqual([{ type: "text", text: "The file says hello." }]);
	});
});
