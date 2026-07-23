import type { KnownProvider, ProviderEnv } from "./types.ts";
import { getProviderEnvValue } from "./utils/provider-env.ts";

const LITELLM_API_KEY_ENV = "LITELLM_API_KEY";
const OPENAI_API_KEY_ENV = "OPENAI_API_KEY";
const GOOGLE_API_KEY_ENV = "GOOGLE_API_KEY";
const GEMINI_API_KEY_ENV = "GEMINI_API_KEY";

const providerEnvKeys: Record<KnownProvider, readonly string[]> = {
	litellm: [LITELLM_API_KEY_ENV],
	openai: [OPENAI_API_KEY_ENV],
	google: [GOOGLE_API_KEY_ENV, GEMINI_API_KEY_ENV],
};

export function findEnvKeys(provider: KnownProvider | string, env?: ProviderEnv): string[] | undefined {
	const keys = (providerEnvKeys as Record<string, readonly string[] | undefined>)[provider];
	if (!keys) return undefined;
	const found = keys.filter((key) => getProviderEnvValue(key, env));
	return found.length > 0 ? found : undefined;
}

export function getEnvApiKey(provider: KnownProvider | string, env?: ProviderEnv): string | undefined {
	const keys = (providerEnvKeys as Record<string, readonly string[] | undefined>)[provider];
	if (!keys) return undefined;
	for (const key of keys) {
		const value = getProviderEnvValue(key, env);
		if (value) return value;
	}
	return undefined;
}
