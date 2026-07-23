import { Type } from "typebox";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stream as streamOpenAIResponses } from "../src/api/openai-responses.ts";
import type { Model, Tool } from "../src/types.ts";

const mockState = vi.hoisted(() => ({
	eventSets: [] as unknown[][],
	payloads: [] as unknown[],
}));

vi.mock("openai", () => {
	class FakeOpenAI {
		responses = {
			create: (payload: unknown) => {
				mockState.payloads.push(payload);
				const events = mockState.eventSets.shift() ?? [];
				const responseStream = {
					async *[Symbol.asyncIterator]() {
						for (const event of events) yield event;
					},
				};
				const result = Promise.resolve(responseStream) as Promise<typeof responseStream> & {
					withResponse: () => Promise<{
						data: typeof responseStream;
						response: { status: number; headers: Headers };
					}>;
				};
				result.withResponse = async () => ({
					data: responseStream,
					response: { status: 200, headers: new Headers() },
				});
				return result;
			},
		};
	}
	return { default: FakeOpenAI };
});

const readTool: Tool = {
	name: "read",
	description: "Read a file",
	parameters: Type.Object({ path: Type.String() }),
};

function model(): Model<"openai-responses"> {
	return {
		id: "gpt-5.6-terra",
		name: "GPT-5.6 Terra",
		api: "openai-responses",
		provider: "openai",
		baseUrl: "https://api.openai.com/v1",
		reasoning: true,
		thinkingLevelMap: { off: "none", max: "max" },
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1_050_000,
		maxTokens: 128_000,
	};
}

describe("openai-responses reasoning summaries", () => {
	beforeEach(() => {
		mockState.eventSets = [];
		mockState.payloads = [];
	});

	it("requests and streams GPT-5.6 reasoning summaries alongside function tools", async () => {
		const reasoningItem = {
			type: "reasoning",
			id: "rs_1",
			summary: [{ type: "summary_text", text: "Inspect the requested file." }],
			encrypted_content: "encrypted-reasoning",
		};
		const functionCall = {
			type: "function_call",
			id: "fc_1",
			call_id: "call_1",
			name: "read",
			arguments: '{"path":"README.md"}',
		};
		mockState.eventSets = [
			[
				{ type: "response.created", response: { id: "resp_1" } },
				{ type: "response.output_item.added", output_index: 0, item: { ...reasoningItem, summary: [] } },
				{
					type: "response.reasoning_summary_text.delta",
					output_index: 0,
					delta: "Inspect the requested file.",
				},
				{ type: "response.output_item.done", output_index: 0, item: reasoningItem },
				{ type: "response.output_item.added", output_index: 1, item: functionCall },
				{ type: "response.output_item.done", output_index: 1, item: functionCall },
				{
					type: "response.completed",
					response: {
						id: "resp_1",
						status: "completed",
						output: [reasoningItem, functionCall],
						usage: {
							input_tokens: 20,
							output_tokens: 8,
							total_tokens: 28,
							input_tokens_details: { cached_tokens: 2 },
							output_tokens_details: { reasoning_tokens: 5 },
						},
					},
				},
			],
		];

		const result = await streamOpenAIResponses(
			model(),
			{ messages: [{ role: "user", content: "Read README", timestamp: 0 }], tools: [readTool] },
			{ apiKey: "test", reasoningEffort: "high" },
		).result();

		expect(mockState.payloads[0]).toMatchObject({
			reasoning: { effort: "high", summary: "auto" },
			include: ["reasoning.encrypted_content"],
			tools: [expect.objectContaining({ type: "function", name: "read" })],
		});
		expect(result.content[0]).toMatchObject({
			type: "thinking",
			thinking: "Inspect the requested file.",
			thinkingSignature: JSON.stringify(reasoningItem),
		});
		expect(result.content[1]).toMatchObject({
			type: "toolCall",
			id: "call_1|fc_1",
			name: "read",
			arguments: { path: "README.md" },
		});
		expect(result.usage.reasoning).toBe(5);
		expect(result.stopReason).toBe("toolUse");
	});
});
