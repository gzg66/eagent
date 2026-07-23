import { calculateCost, clampThinkingLevel } from "../models.ts";
import type {
	AssistantMessage,
	Context,
	Model,
	ProviderHeaders,
	SimpleStreamOptions,
	StreamFunction,
	StreamOptions,
	TextContent,
	ThinkingContent,
	ThinkingLevel,
	ToolCall,
} from "../types.ts";
import { formatProviderError, normalizeProviderError } from "../utils/error-body.ts";
import { AssistantMessageEventStream } from "../utils/event-stream.ts";
import { headersToRecord, providerHeadersToRecord } from "../utils/headers.ts";
import {
	convertGoogleMessages,
	convertGoogleTools,
	type GoogleContent,
	type GooglePart,
	mapGoogleStopReason,
	retainThoughtSignature,
} from "./google-shared.ts";
import { buildBaseOptions } from "./simple-options.ts";

export interface GoogleOptions extends StreamOptions {
	toolChoice?: "auto" | "none" | "any";
	thinking?: { enabled: boolean; level?: "MINIMAL" | "LOW" | "MEDIUM" | "HIGH"; budgetTokens?: number };
}

interface GoogleRequest {
	contents: GoogleContent[];
	systemInstruction?: { parts: Array<{ text: string }> };
	tools?: Array<{ functionDeclarations: Record<string, unknown>[] }>;
	toolConfig?: { functionCallingConfig: { mode: "AUTO" | "NONE" | "ANY" } };
	generationConfig: {
		temperature?: number;
		maxOutputTokens?: number;
		thinkingConfig?: { includeThoughts?: boolean; thinkingLevel?: string; thinkingBudget?: number };
	};
}

interface GoogleResponseChunk {
	responseId?: string;
	candidates?: Array<{
		content?: { parts?: GooglePart[] };
		finishReason?: string;
	}>;
	usageMetadata?: {
		promptTokenCount?: number;
		candidatesTokenCount?: number;
		cachedContentTokenCount?: number;
		thoughtsTokenCount?: number;
		totalTokenCount?: number;
	};
}

let toolCallCounter = 0;

export const stream: StreamFunction<"google-generative-ai", GoogleOptions> = (
	model: Model<"google-generative-ai">,
	context: Context,
	options?: GoogleOptions,
): AssistantMessageEventStream => {
	const eventStream = new AssistantMessageEventStream();
	void runGoogleStream(model, context, options, eventStream);
	return eventStream;
};

async function runGoogleStream(
	model: Model<"google-generative-ai">,
	context: Context,
	options: GoogleOptions | undefined,
	eventStream: AssistantMessageEventStream,
): Promise<void> {
	const output: AssistantMessage = {
		role: "assistant",
		content: [],
		api: model.api,
		provider: model.provider,
		model: model.id,
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
	};

	try {
		if (!options?.apiKey) throw new Error(`No API key for provider: ${model.provider}`);
		let payload = buildGoogleRequest(model, context, options);
		const replacedPayload = await options.onPayload?.(payload, model);
		if (replacedPayload !== undefined) payload = replacedPayload as GoogleRequest;

		const controller = new AbortController();
		const abort = () => controller.abort();
		options.signal?.addEventListener("abort", abort, { once: true });
		const timeout = options.timeoutMs === undefined ? undefined : setTimeout(abort, options.timeoutMs);
		let response: Response;
		try {
			response = await fetch(buildGoogleUrl(model), {
				method: "POST",
				headers: buildGoogleHeaders(model.headers, options.headers, options.apiKey),
				body: JSON.stringify(payload),
				signal: controller.signal,
			});
		} finally {
			if (timeout) clearTimeout(timeout);
			options.signal?.removeEventListener("abort", abort);
		}
		await options.onResponse?.({ status: response.status, headers: headersToRecord(response.headers) }, model);
		if (!response.ok) {
			const body = await response.text();
			throw new Error(`Google API ${response.status}: ${body || response.statusText}`);
		}
		if (!response.body) throw new Error("Google API returned no response body");

		eventStream.push({ type: "start", partial: output });
		let currentBlock: TextContent | ThinkingContent | null = null;
		for await (const chunk of parseGoogleSse(response.body)) {
			output.responseId ||= chunk.responseId;
			const candidate = chunk.candidates?.[0];
			for (const part of candidate?.content?.parts ?? []) {
				if (part.text !== undefined) {
					const isThinking = part.thought === true;
					if (
						!currentBlock ||
						(isThinking && currentBlock.type !== "thinking") ||
						(!isThinking && currentBlock.type !== "text")
					) {
						finishCurrentBlock(eventStream, output, currentBlock);
						currentBlock = isThinking
							? { type: "thinking", thinking: "", thinkingSignature: undefined }
							: { type: "text", text: "" };
						output.content.push(currentBlock);
						eventStream.push({
							type: isThinking ? "thinking_start" : "text_start",
							contentIndex: output.content.length - 1,
							partial: output,
						});
					}
					if (currentBlock.type === "thinking") {
						currentBlock.thinking += part.text;
						currentBlock.thinkingSignature = retainThoughtSignature(
							currentBlock.thinkingSignature,
							part.thoughtSignature,
						);
						eventStream.push({
							type: "thinking_delta",
							contentIndex: output.content.length - 1,
							delta: part.text,
							partial: output,
						});
					} else {
						currentBlock.text += part.text;
						currentBlock.textSignature = retainThoughtSignature(
							currentBlock.textSignature,
							part.thoughtSignature,
						);
						eventStream.push({
							type: "text_delta",
							contentIndex: output.content.length - 1,
							delta: part.text,
							partial: output,
						});
					}
				}

				if (part.functionCall) {
					finishCurrentBlock(eventStream, output, currentBlock);
					currentBlock = null;
					const toolCall: ToolCall = {
						type: "toolCall",
						id: part.functionCall.id ?? `${part.functionCall.name ?? "tool"}_${Date.now()}_${++toolCallCounter}`,
						name: part.functionCall.name ?? "",
						arguments: part.functionCall.args ?? {},
						...(part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {}),
					};
					output.content.push(toolCall);
					const contentIndex = output.content.length - 1;
					eventStream.push({ type: "toolcall_start", contentIndex, partial: output });
					eventStream.push({
						type: "toolcall_delta",
						contentIndex,
						delta: JSON.stringify(toolCall.arguments),
						partial: output,
					});
					eventStream.push({ type: "toolcall_end", contentIndex, toolCall, partial: output });
				}
			}
			if (candidate?.finishReason) output.stopReason = mapGoogleStopReason(candidate.finishReason);
			if (output.content.some((block) => block.type === "toolCall")) output.stopReason = "toolUse";
			applyGoogleUsage(model, output, chunk);
		}
		finishCurrentBlock(eventStream, output, currentBlock);
		if (options.signal?.aborted) throw new Error("Request was aborted");
		if (output.stopReason === "error") throw new Error("Google API returned an error finish reason");
		if (output.stopReason === "aborted") throw new Error("Request was aborted");
		eventStream.push({ type: "done", reason: output.stopReason, message: output });
		eventStream.end();
	} catch (error) {
		output.stopReason = options?.signal?.aborted ? "aborted" : "error";
		output.errorMessage = formatProviderError(normalizeProviderError(error));
		eventStream.push({ type: "error", reason: output.stopReason, error: output });
		eventStream.end();
	}
}

function buildGoogleRequest(
	model: Model<"google-generative-ai">,
	context: Context,
	options: GoogleOptions,
): GoogleRequest {
	const generationConfig: GoogleRequest["generationConfig"] = {
		...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
		...(options.maxTokens !== undefined ? { maxOutputTokens: options.maxTokens } : {}),
	};
	if (options.thinking?.enabled && model.reasoning) {
		generationConfig.thinkingConfig = {
			includeThoughts: true,
			...(options.thinking.level ? { thinkingLevel: options.thinking.level } : {}),
			...(options.thinking.budgetTokens !== undefined ? { thinkingBudget: options.thinking.budgetTokens } : {}),
		};
	} else if (model.reasoning && options.thinking && !options.thinking.enabled) {
		generationConfig.thinkingConfig = { thinkingLevel: isGemini3Pro(model.id) ? "LOW" : "MINIMAL" };
	}
	return {
		contents: convertGoogleMessages(model, context),
		...(context.systemPrompt ? { systemInstruction: { parts: [{ text: context.systemPrompt }] } } : {}),
		...(context.tools?.length ? { tools: convertGoogleTools(context.tools) } : {}),
		...(context.tools?.length && options.toolChoice
			? {
					toolConfig: {
						functionCallingConfig: { mode: options.toolChoice.toUpperCase() as "AUTO" | "NONE" | "ANY" },
					},
				}
			: {}),
		generationConfig,
	};
}

function buildGoogleUrl(model: Model<"google-generative-ai">): string {
	return `${model.baseUrl.replace(/\/+$/, "")}/models/${encodeURIComponent(model.id)}:streamGenerateContent?alt=sse`;
}

function buildGoogleHeaders(
	modelHeaders: ProviderHeaders | undefined,
	optionHeaders: ProviderHeaders | undefined,
	apiKey: string,
): Record<string, string> {
	return {
		"content-type": "application/json",
		"x-goog-api-key": apiKey,
		...(providerHeadersToRecord(modelHeaders) ?? {}),
		...(providerHeadersToRecord(optionHeaders) ?? {}),
	};
}

async function* parseGoogleSse(body: ReadableStream<Uint8Array>): AsyncGenerator<GoogleResponseChunk> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	while (true) {
		const { done, value } = await reader.read();
		buffer += decoder.decode(value, { stream: !done });
		const events = buffer.split(/\r?\n\r?\n/);
		buffer = events.pop() ?? "";
		for (const event of events) {
			const data = event
				.split(/\r?\n/)
				.filter((line) => line.startsWith("data:"))
				.map((line) => line.slice(5).trimStart())
				.join("\n");
			if (data && data !== "[DONE]") yield JSON.parse(data) as GoogleResponseChunk;
		}
		if (done) break;
	}
	if (buffer.trim()) {
		const data = buffer.replace(/^data:\s*/gm, "").trim();
		if (data && data !== "[DONE]") yield JSON.parse(data) as GoogleResponseChunk;
	}
}

function finishCurrentBlock(
	eventStream: AssistantMessageEventStream,
	output: AssistantMessage,
	block: TextContent | ThinkingContent | null,
): void {
	if (!block) return;
	const contentIndex = output.content.indexOf(block);
	if (block.type === "text") {
		eventStream.push({ type: "text_end", contentIndex, content: block.text, partial: output });
	} else {
		eventStream.push({ type: "thinking_end", contentIndex, content: block.thinking, partial: output });
	}
}

function applyGoogleUsage(
	model: Model<"google-generative-ai">,
	output: AssistantMessage,
	chunk: GoogleResponseChunk,
): void {
	const usage = chunk.usageMetadata;
	if (!usage) return;
	const cacheRead = usage.cachedContentTokenCount ?? 0;
	output.usage = {
		input: Math.max(0, (usage.promptTokenCount ?? 0) - cacheRead),
		output: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
		cacheRead,
		cacheWrite: 0,
		reasoning: usage.thoughtsTokenCount ?? 0,
		totalTokens: usage.totalTokenCount ?? 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
	calculateCost(model, output.usage);
}

export const streamSimple: StreamFunction<"google-generative-ai", SimpleStreamOptions> = (
	model: Model<"google-generative-ai">,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream => {
	const base = buildBaseOptions(model, context, options, options?.apiKey);
	if (!options?.reasoning) return stream(model, context, { ...base, thinking: { enabled: false } });
	const clamped = clampThinkingLevel(model, options.reasoning);
	const level = googleThinkingLevel(model.id, clamped === "off" ? "low" : clamped);
	return stream(model, context, { ...base, thinking: { enabled: true, level } });
};

function isGemini3Pro(modelId: string): boolean {
	return /gemini-3(?:\.\d+)?-pro/.test(modelId.toLowerCase());
}

function googleThinkingLevel(modelId: string, effort: ThinkingLevel): "MINIMAL" | "LOW" | "MEDIUM" | "HIGH" {
	if (effort === "xhigh" || effort === "max") return "HIGH";
	if (isGemini3Pro(modelId)) return effort === "minimal" || effort === "low" ? "LOW" : "HIGH";
	return effort.toUpperCase() as "MINIMAL" | "LOW" | "MEDIUM" | "HIGH";
}
