import type { KnownProvider, ProviderEnv } from "./types.ts";
import { getProviderEnvValue } from "./utils/provider-env.ts";

const LITELLM_API_KEY_ENV = "LITELLM_API_KEY";

export function findEnvKeys(provider: KnownProvider | string, env?: ProviderEnv): string[] | undefined {
	if (provider !== "litellm") return undefined;
	return getProviderEnvValue(LITELLM_API_KEY_ENV, env) ? [LITELLM_API_KEY_ENV] : undefined;
}

export function getEnvApiKey(provider: KnownProvider | string, env?: ProviderEnv): string | undefined {
	return provider === "litellm" ? getProviderEnvValue(LITELLM_API_KEY_ENV, env) : undefined;
}
