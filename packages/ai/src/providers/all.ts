import { type CreateModelsOptions, createModels, type MutableModels, type Provider } from "../models.ts";
import type { Api, Model } from "../types.ts";
import { litellmProvider } from "./litellm.ts";

export type BuiltinProvider = "litellm";

export function getBuiltinModel(_provider: BuiltinProvider, _modelId: string): Model<Api> | undefined {
	return undefined;
}

export function getBuiltinProviders(): BuiltinProvider[] {
	return ["litellm"];
}

export function getBuiltinModels(_provider: BuiltinProvider): Model<Api>[] {
	return [];
}

export function builtinProviders(): Provider[] {
	return [litellmProvider()];
}

export function builtinModels(options?: CreateModelsOptions): MutableModels {
	const models = createModels(options);
	models.setProvider(litellmProvider());
	return models;
}
