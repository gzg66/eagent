import { type CreateModelsOptions, createModels, type MutableModels, type Provider } from "../models.ts";
import type { Api, Model } from "../types.ts";
import { googleProvider } from "./google.ts";
import { litellmProvider } from "./litellm.ts";
import { openaiProvider } from "./openai.ts";

export type BuiltinProvider = "litellm" | "openai" | "google";

export function getBuiltinModel(_provider: BuiltinProvider, _modelId: string): Model<Api> | undefined {
	return undefined;
}

export function getBuiltinProviders(): BuiltinProvider[] {
	return ["litellm", "openai", "google"];
}

export function getBuiltinModels(_provider: BuiltinProvider): Model<Api>[] {
	return [];
}

export function builtinProviders(): Provider[] {
	return [litellmProvider(), openaiProvider(), googleProvider()];
}

export function builtinModels(options?: CreateModelsOptions): MutableModels {
	const models = createModels(options);
	models.setProvider(litellmProvider());
	models.setProvider(openaiProvider());
	models.setProvider(googleProvider());
	return models;
}
