import { describe, expect, test } from "vitest";
import { findEnvKeys, getEnvApiKey } from "../src/env-api-keys.ts";

describe("provider environment API keys", () => {
	test("resolves the LiteLLM API key from the documented variable", () => {
		const env = { LITELLM_API_KEY: "deepseek-key" };

		expect(findEnvKeys("litellm", env)).toEqual(["LITELLM_API_KEY"]);
		expect(getEnvApiKey("litellm", env)).toBe("deepseek-key");
	});

	test("supports both Gemini environment variable names in priority order", () => {
		const env = {
			GOOGLE_API_KEY: "google-key",
			GEMINI_API_KEY: "gemini-key",
		};

		expect(findEnvKeys("google", env)).toEqual(["GOOGLE_API_KEY", "GEMINI_API_KEY"]);
		expect(getEnvApiKey("google", env)).toBe("google-key");
	});
});
