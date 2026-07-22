import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { ModelConfig } from "../src/core/model-config.ts";

const temporaryDirectories: string[] = [];

async function loadConfig(value: unknown): Promise<ModelConfig> {
	const directory = await mkdtemp(join(tmpdir(), "enterprise-agent-model-config-"));
	temporaryDirectories.push(directory);
	const path = join(directory, "models.json");
	await writeFile(path, JSON.stringify(value), "utf8");
	return ModelConfig.load(path);
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

describe("LiteLLM model configuration", () => {
	test("accepts a LiteLLM-only OpenAI-compatible configuration", async () => {
		const config = await loadConfig({
			providers: {
				litellm: {
					baseUrl: "http://127.0.0.1:4000/v1",
					api: "openai-completions",
					apiKey: "$LITELLM_API_KEY",
					models: [{ id: "enterprise-default" }],
				},
			},
		});

		expect(config.getError()).toBeUndefined();
		expect(config.getProviderIds()).toEqual(["litellm"]);
	});

	test("rejects every other provider ID", async () => {
		const config = await loadConfig({
			providers: {
				direct: {
					baseUrl: "https://example.invalid/v1",
					api: "openai-completions",
					models: [{ id: "forbidden" }],
				},
			},
		});

		expect(config.getProviderIds()).toEqual([]);
		expect(config.getError()).toContain('only the "litellm" provider is supported');
	});

	test("rejects APIs other than OpenAI-compatible completions", async () => {
		const config = await loadConfig({
			providers: {
				litellm: {
					baseUrl: "http://127.0.0.1:4000/v1",
					api: "unsupported-api",
					models: [{ id: "enterprise-default" }],
				},
			},
		});

		expect(config.getProviderIds()).toEqual([]);
		expect(config.getError()).toContain("Invalid models.json schema");
	});
});
