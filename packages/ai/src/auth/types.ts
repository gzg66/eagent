import type { ProviderEnv, ProviderHeaders } from "../types.ts";

/** Request authentication for one LiteLLM request. */
export interface ModelAuth {
	apiKey?: string;
	headers?: ProviderHeaders;
	baseUrl?: string;
}

/** Stored LiteLLM API-key credential. */
export interface ApiKeyCredential {
	type: "api_key";
	key?: string;
	env?: ProviderEnv;
}

/** One API-key credential per provider. */
export type Credential = ApiKeyCredential;

/** Non-secret credential metadata for account/status enumeration. */
export interface CredentialInfo {
	providerId: string;
	type: "api_key";
}

/** Application-owned credential storage keyed by provider ID. */
export interface CredentialStore {
	read(providerId: string): Promise<Credential | undefined>;
	list(): Promise<readonly CredentialInfo[]>;
	modify(
		providerId: string,
		fn: (current: Credential | undefined) => Promise<Credential | undefined>,
	): Promise<Credential | undefined>;
	delete(providerId: string): Promise<void>;
}

/** Environment access for authentication resolution. */
export interface AuthContext {
	env(name: string): Promise<string | undefined>;
	fileExists(path: string): Promise<boolean>;
}

/** Result of resolving authentication for a model. */
export interface AuthResult {
	auth: ModelAuth;
	env?: ProviderEnv;
	/** Human-readable status source, for example `LITELLM_API_KEY`. */
	source?: string;
}

export interface AuthCheck {
	source?: string;
	type: "api_key";
}

export type AuthType = "api_key";

export type AuthPrompt = { signal?: AbortSignal } & (
	| { type: "text"; message: string; placeholder?: string }
	| { type: "secret"; message: string; placeholder?: string }
	| { type: "select"; message: string; options: readonly { id: string; label: string; description?: string }[] }
);

export interface AuthInfoLink {
	url: string;
	label?: string;
}

export type AuthEvent =
	| { type: "info"; message: string; links?: readonly AuthInfoLink[] }
	| { type: "progress"; message: string };

/** User interaction used to save a LiteLLM API key. */
export interface AuthInteraction {
	signal?: AbortSignal;
	prompt(prompt: AuthPrompt): Promise<string>;
	notify(event: AuthEvent): void;
}

/** LiteLLM API-key authentication. */
export interface ApiKeyAuth {
	name: string;
	login?(interaction: AuthInteraction): Promise<ApiKeyCredential>;
	check?(input: { ctx: AuthContext; credential?: ApiKeyCredential }): Promise<AuthCheck | undefined>;
	resolve(input: { ctx: AuthContext; credential?: ApiKeyCredential }): Promise<AuthResult | undefined>;
}

export interface ProviderAuth {
	apiKey: ApiKeyAuth;
}
