import { stream, streamSimple } from "../api/openai-completions.ts";
import { envApiKeyAuth } from "../auth/helpers.ts";
import { createProvider, type Provider } from "../models.ts";

/** Google Gemini provider via OpenAI-compatible endpoint. Models and base URL are defined in models.json. */
export function googleProvider(): Provider<"openai-completions"> {
	return createProvider<"openai-completions">({
		id: "google",
		name: "Google",
		auth: { apiKey: envApiKeyAuth("Google API key", ["GOOGLE_API_KEY", "GEMINI_API_KEY"]) },
		models: [],
		api: { stream, streamSimple },
	});
}
