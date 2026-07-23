import { stream, streamSimple } from "../api/openai-responses.ts";
import { envApiKeyAuth } from "../auth/helpers.ts";
import { createProvider, type Provider } from "../models.ts";

/** OpenAI direct provider. Models and base URL are defined in models.json. */
export function openaiProvider(): Provider<"openai-responses"> {
	return createProvider<"openai-responses">({
		id: "openai",
		name: "OpenAI",
		auth: { apiKey: envApiKeyAuth("OpenAI API key", ["OPENAI_API_KEY"]) },
		models: [],
		api: { stream, streamSimple },
	});
}
