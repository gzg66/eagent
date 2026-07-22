import type { Api, Model, ProviderHeaders } from "@enterprise-agent/ai";
import type { SettingsManager } from "./settings-manager.ts";

export function mergeProviderAttributionHeaders(
	_model: Model<Api>,
	_settingsManager: SettingsManager,
	_sessionId: string | undefined,
	...headerSources: Array<ProviderHeaders | undefined>
): ProviderHeaders | undefined {
	const merged = Object.assign({}, ...headerSources.filter((headers) => headers !== undefined)) as ProviderHeaders;
	return Object.keys(merged).length > 0 ? merged : undefined;
}
