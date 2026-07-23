import type { Context, ImageContent, Model, StopReason, TextContent, Tool } from "../types.ts";
import { sanitizeSurrogates } from "../utils/sanitize-unicode.ts";
import { transformMessages } from "./transform-messages.ts";

export interface GooglePart {
	text?: string;
	thought?: boolean;
	thoughtSignature?: string;
	inlineData?: { mimeType: string; data: string };
	functionCall?: { name?: string; args?: Record<string, unknown>; id?: string };
	functionResponse?: {
		name: string;
		response: { output: string } | { error: string };
		parts?: GooglePart[];
		id?: string;
	};
}

export interface GoogleContent {
	role: "user" | "model";
	parts: GooglePart[];
}

const base64SignaturePattern = /^[A-Za-z0-9+/]+={0,2}$/;

function resolveThoughtSignature(isSameProviderAndModel: boolean, signature: string | undefined): string | undefined {
	if (!isSameProviderAndModel || !signature || signature.length % 4 !== 0) return undefined;
	return base64SignaturePattern.test(signature) ? signature : undefined;
}

export function retainThoughtSignature(existing: string | undefined, incoming: string | undefined): string | undefined {
	return typeof incoming === "string" && incoming.length > 0 ? incoming : existing;
}

export function convertGoogleMessages(model: Model<"google-generative-ai">, context: Context): GoogleContent[] {
	const contents: GoogleContent[] = [];
	const messages = transformMessages(context.messages, model);

	for (const message of messages) {
		if (message.role === "user") {
			const parts: GooglePart[] =
				typeof message.content === "string"
					? [{ text: sanitizeSurrogates(message.content) }]
					: message.content.map((item) =>
							item.type === "text"
								? { text: sanitizeSurrogates(item.text) }
								: { inlineData: { mimeType: item.mimeType, data: item.data } },
						);
			if (parts.length > 0) contents.push({ role: "user", parts });
			continue;
		}

		if (message.role === "assistant") {
			const parts: GooglePart[] = [];
			const isSameProviderAndModel =
				message.provider === model.provider && message.api === model.api && message.model === model.id;
			for (const block of message.content) {
				if (block.type === "text") {
					if (!block.text.trim()) continue;
					const thoughtSignature = resolveThoughtSignature(isSameProviderAndModel, block.textSignature);
					parts.push({
						text: sanitizeSurrogates(block.text),
						...(thoughtSignature ? { thoughtSignature } : {}),
					});
				} else if (block.type === "thinking") {
					if (!block.thinking.trim()) continue;
					const thoughtSignature = resolveThoughtSignature(isSameProviderAndModel, block.thinkingSignature);
					parts.push({
						text: sanitizeSurrogates(block.thinking),
						thought: true,
						...(thoughtSignature ? { thoughtSignature } : {}),
					});
				} else {
					const thoughtSignature = resolveThoughtSignature(isSameProviderAndModel, block.thoughtSignature);
					parts.push({
						functionCall: { name: block.name, args: block.arguments },
						...(thoughtSignature ? { thoughtSignature } : {}),
					});
				}
			}
			if (parts.length > 0) contents.push({ role: "model", parts });
			continue;
		}

		const textContent = message.content.filter((item): item is TextContent => item.type === "text");
		const imageContent = model.input.includes("image")
			? message.content.filter((item): item is ImageContent => item.type === "image")
			: [];
		const responseText = textContent.map((item) => item.text).join("\n");
		const imageParts = imageContent.map(
			(item): GooglePart => ({ inlineData: { mimeType: item.mimeType, data: item.data } }),
		);
		const functionResponse: GooglePart = {
			functionResponse: {
				name: message.toolName,
				response: message.isError ? { error: responseText } : { output: responseText },
				...(imageParts.length > 0 ? { parts: imageParts } : {}),
			},
		};
		const previous = contents.at(-1);
		if (previous?.role === "user" && previous.parts.some((part) => part.functionResponse)) {
			previous.parts.push(functionResponse);
		} else {
			contents.push({ role: "user", parts: [functionResponse] });
		}
	}

	return contents;
}

export function convertGoogleTools(
	tools: Tool[],
): Array<{ functionDeclarations: Record<string, unknown>[] }> | undefined {
	if (tools.length === 0) return undefined;
	return [
		{
			functionDeclarations: tools.map((tool) => ({
				name: tool.name,
				description: tool.description,
				parametersJsonSchema: tool.parameters,
			})),
		},
	];
}

export function mapGoogleStopReason(reason: string): StopReason {
	if (reason === "STOP") return "stop";
	if (reason === "MAX_TOKENS") return "length";
	return "error";
}
