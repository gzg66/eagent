export * from "./index.ts";

import { stream as openAIStream, streamSimple as openAIStreamSimple } from "./api/openai-completions.ts";
import { getEnvApiKey } from "./env-api-keys.ts";
import { createFauxCore, type FauxProviderRegistration, type RegisterFauxProviderOptions } from "./providers/faux.ts";
import type {
	Api,
	AssistantMessage,
	AssistantMessageEventStream,
	Context,
	Model,
	ProviderStreamOptions,
	SimpleStreamOptions,
	StreamFunction,
	StreamOptions,
} from "./types.ts";

export interface ApiProvider<TApi extends Api = Api, TOptions extends StreamOptions = StreamOptions> {
	api: TApi;
	stream: StreamFunction<TApi, TOptions>;
	streamSimple: StreamFunction<TApi, SimpleStreamOptions>;
}

interface RegisteredApiProvider {
	provider: ApiProvider;
	sourceId?: string;
}

const apiProviderRegistry = new Map<string, RegisteredApiProvider>();

export function registerApiProvider<TApi extends Api, TOptions extends StreamOptions>(
	provider: ApiProvider<TApi, TOptions>,
	sourceId?: string,
): void {
	apiProviderRegistry.set(provider.api, { provider: provider as unknown as ApiProvider, sourceId });
}

export function getApiProvider(api: Api): ApiProvider | undefined {
	return apiProviderRegistry.get(api)?.provider;
}

export function getApiProviders(): ApiProvider[] {
	return Array.from(apiProviderRegistry.values(), (entry) => entry.provider);
}

export function unregisterApiProviders(sourceId: string): void {
	for (const [api, entry] of apiProviderRegistry) {
		if (entry.sourceId === sourceId) apiProviderRegistry.delete(api);
	}
}

export function registerBuiltInApiProviders(): void {
	if (!getApiProvider("openai-completions")) {
		registerApiProvider({ api: "openai-completions", stream: openAIStream, streamSimple: openAIStreamSimple });
	}
}

export function resetApiProviders(): void {
	apiProviderRegistry.clear();
	registerBuiltInApiProviders();
}

export function registerFauxProvider(options: RegisterFauxProviderOptions = {}): FauxProviderRegistration {
	const core = createFauxCore(options);
	const sourceId = `faux-provider-${Math.random().toString(36).slice(2, 10)}`;
	registerApiProvider({ api: core.api, stream: core.stream, streamSimple: core.streamSimple }, sourceId);
	return {
		api: core.api,
		models: core.models,
		getModel: core.getModel,
		state: core.state,
		setResponses: core.setResponses,
		appendResponses: core.appendResponses,
		getPendingResponseCount: core.getPendingResponseCount,
		unregister: () => unregisterApiProviders(sourceId),
	};
}

export function getModel(_provider: string, modelId: string): Model<"openai-completions"> {
	return {
		id: modelId,
		name: modelId,
		api: "openai-completions",
		provider: "litellm",
		baseUrl: "http://127.0.0.1:4000/v1",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128_000,
		maxTokens: 16_384,
	};
}

export function getModels(_provider?: string): Model<Api>[] {
	return [];
}

export function getProviders(): string[] {
	return ["litellm"];
}

function resolveApiProvider(api: Api): ApiProvider {
	const provider = getApiProvider(api);
	if (!provider) throw new Error(`No API provider registered for api: ${api}`);
	return provider;
}

function withLiteLLMApiKey<T extends StreamOptions>(model: Model<Api>, options: T | undefined): T | undefined {
	if (options?.apiKey || model.provider !== "litellm") return options;
	const apiKey = getEnvApiKey("litellm", options?.env);
	return apiKey ? ({ ...options, apiKey } as T) : options;
}

export function stream<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	options?: ProviderStreamOptions,
): AssistantMessageEventStream {
	return resolveApiProvider(model.api).stream(model, context, withLiteLLMApiKey(model, options));
}

export async function complete<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	options?: ProviderStreamOptions,
): Promise<AssistantMessage> {
	return stream(model, context, options).result();
}

export function streamSimple<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream {
	return resolveApiProvider(model.api).streamSimple(model, context, withLiteLLMApiKey(model, options));
}

export async function completeSimple<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	options?: SimpleStreamOptions,
): Promise<AssistantMessage> {
	return streamSimple(model, context, options).result();
}

registerBuiltInApiProviders();
