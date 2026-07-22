import { stream, streamSimple } from "../api/openai-completions.ts";
import { envApiKeyAuth } from "../auth/helpers.ts";
import { createProvider, type Provider } from "../models.ts";

/** LiteLLM gateway provider. Models and base URL are defined in models.json. */
export function litellmProvider(): Provider<"openai-completions"> {
	return createProvider<"openai-completions">({
		id: "litellm",
		name: "LiteLLM",
		auth: { apiKey: envApiKeyAuth("LiteLLM API key", ["LITELLM_API_KEY"]) },
		models: [],
		api: { stream, streamSimple },
	});
}
