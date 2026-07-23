import { stream, streamSimple } from "../api/google-generative-ai.ts";
import { envApiKeyAuth } from "../auth/helpers.ts";
import { createProvider, type Provider } from "../models.ts";

/** Google Gemini provider using the native GenerateContent streaming API. */
export function googleProvider(): Provider<"google-generative-ai"> {
	return createProvider<"google-generative-ai">({
		id: "google",
		name: "Google",
		auth: { apiKey: envApiKeyAuth("Google API key", ["GOOGLE_API_KEY", "GEMINI_API_KEY"]) },
		models: [],
		api: { stream, streamSimple },
	});
}
