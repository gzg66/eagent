import { describe, expect, test } from "vitest";
import { AuthStorage } from "../src/core/auth-storage.ts";
import { RuntimeCredentials } from "../src/core/runtime-credentials.ts";

describe("RuntimeCredentials", () => {
	test("runtime overrides mask stored credentials without persisting", async () => {
		const storage = AuthStorage.inMemory({ litellm: { type: "api_key", key: "stored-key" } });
		const credentials = new RuntimeCredentials(storage);

		credentials.setRuntimeApiKey("litellm", "runtime-key");
		expect(await credentials.read("litellm")).toEqual({ type: "api_key", key: "runtime-key" });
		expect(await storage.read("litellm")).toEqual({ type: "api_key", key: "stored-key" });

		credentials.removeRuntimeApiKey("litellm");
		expect(await credentials.read("litellm")).toEqual({ type: "api_key", key: "stored-key" });
	});

	test("enumeration merges overrides without exposing keys", async () => {
		const storage = AuthStorage.inMemory({ litellm: { type: "api_key", key: "stored-key" } });
		const credentials = new RuntimeCredentials(storage);
		credentials.setRuntimeApiKey("litellm", "runtime-key");
		credentials.setRuntimeApiKey("auxiliary", "other-runtime-key");

		expect(await credentials.list()).toEqual([
			{ providerId: "litellm", type: "api_key" },
			{ providerId: "auxiliary", type: "api_key" },
		]);
	});

	test("delete clears both the override and persisted credential", async () => {
		const storage = AuthStorage.inMemory({ litellm: { type: "api_key", key: "stored-key" } });
		const credentials = new RuntimeCredentials(storage);
		credentials.setRuntimeApiKey("litellm", "runtime-key");

		await credentials.delete("litellm");

		expect(await credentials.read("litellm")).toBeUndefined();
		expect(await credentials.list()).toEqual([]);
	});
});
