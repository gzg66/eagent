import { stream, streamSimple } from "../api/openai-completions.ts";
import { envApiKeyAuth } from "../auth/helpers.ts";
import { createProvider, type Provider } from "../models.ts";

/** OpenAI direct provider. Models and base URL are defined in models.json. */
export function openaiProvider(): Provider<"openai-completions"> {
	return createProvider<"openai-completions">({
		id: "openai",
		name: "OpenAI",
		auth: { apiKey: envApiKeyAuth("OpenAI API key", ["OPENAI_API_KEY"]) },
		models: [],
		api: { stream, streamSimple },
	});
}
