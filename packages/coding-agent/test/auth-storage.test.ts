import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import lockfile from "proper-lockfile";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AuthStorage } from "../src/core/auth-storage.ts";

describe("AuthStorage", () => {
	let tempDir: string;
	let authJsonPath: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `agent-test-auth-storage-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(tempDir, { recursive: true });
		authJsonPath = join(tempDir, "auth.json");
	});

	afterEach(() => {
		if (existsSync(tempDir)) rmSync(tempDir, { recursive: true });
		vi.restoreAllMocks();
	});

	function writeAuthJson(data: Record<string, unknown>): void {
		writeFileSync(authJsonPath, JSON.stringify(data));
	}

	test("reads and resolves stored API-key credentials", async () => {
		const original = process.env.TEST_AUTH_STORAGE_KEY;
		process.env.TEST_AUTH_STORAGE_KEY = "environment-key";
		try {
			writeAuthJson({ litellm: { type: "api_key", key: "$TEST_AUTH_STORAGE_KEY" } });
			const storage = AuthStorage.create(authJsonPath);
			expect(await storage.read("litellm")).toEqual({ type: "api_key", key: "environment-key" });
		} finally {
			if (original === undefined) delete process.env.TEST_AUTH_STORAGE_KEY;
			else process.env.TEST_AUTH_STORAGE_KEY = original;
		}
	});

	test("resolves command-backed API-key credentials", async () => {
		writeAuthJson({ litellm: { type: "api_key", key: "!printf 'command-key'" } });
		const storage = AuthStorage.create(authJsonPath);
		expect(await storage.read("litellm")).toEqual({ type: "api_key", key: "command-key" });
	});

	test("credential-scoped env takes precedence and remains inspectable", async () => {
		writeAuthJson({
			litellm: {
				type: "api_key",
				key: "$SCOPED_KEY",
				env: { SCOPED_KEY: "scoped-value", REGION: "test-region" },
			},
		});
		const storage = AuthStorage.create(authJsonPath);
		expect(await storage.read("litellm")).toMatchObject({
			key: "scoped-value",
			env: { SCOPED_KEY: "scoped-value", REGION: "test-region" },
		});
	});

	test("modify persists a credential while preserving unrelated external edits", async () => {
		writeAuthJson({ litellm: { type: "api_key", key: "old" } });
		const storage = AuthStorage.create(authJsonPath);
		writeAuthJson({
			litellm: { type: "api_key", key: "old" },
			auxiliary: { type: "api_key", key: "external" },
		});

		await storage.modify("litellm", async () => ({ type: "api_key", key: "new" }));

		expect(JSON.parse(readFileSync(authJsonPath, "utf8"))).toEqual({
			litellm: { type: "api_key", key: "new" },
			auxiliary: { type: "api_key", key: "external" },
		});
	});

	test("modify with undefined leaves the current credential unchanged", async () => {
		writeAuthJson({ litellm: { type: "api_key", key: "stored" } });
		const storage = AuthStorage.create(authJsonPath);
		expect(await storage.modify("litellm", async () => undefined)).toEqual({ type: "api_key", key: "stored" });
		expect(await storage.read("litellm")).toEqual({ type: "api_key", key: "stored" });
	});

	test("serializes concurrent modifications", async () => {
		writeAuthJson({});
		const first = AuthStorage.create(authJsonPath);
		const second = AuthStorage.create(authJsonPath);
		await Promise.all([
			first.modify("litellm", async () => ({ type: "api_key", key: "gateway-key" })),
			second.modify("auxiliary", async () => ({ type: "api_key", key: "auxiliary-key" })),
		]);
		expect(JSON.parse(readFileSync(authJsonPath, "utf8"))).toEqual({
			litellm: { type: "api_key", key: "gateway-key" },
			auxiliary: { type: "api_key", key: "auxiliary-key" },
		});
	});

	test("delete removes one credential while preserving others", async () => {
		writeAuthJson({
			litellm: { type: "api_key", key: "gateway-key" },
			auxiliary: { type: "api_key", key: "auxiliary-key" },
		});
		const storage = AuthStorage.create(authJsonPath);
		writeAuthJson({
			litellm: { type: "api_key", key: "gateway-key" },
			auxiliary: { type: "api_key", key: "auxiliary-key" },
			external: { type: "api_key", key: "external-key" },
		});
		await storage.delete("litellm");
		await expect(storage.list()).resolves.toEqual([
			{ providerId: "auxiliary", type: "api_key" },
			{ providerId: "external", type: "api_key" },
		]);
		expect(await storage.read("litellm")).toBeUndefined();
		expect(await storage.read("auxiliary")).toEqual({ type: "api_key", key: "auxiliary-key" });
		expect(await storage.read("external")).toEqual({ type: "api_key", key: "external-key" });
	});

	test("in-memory storage implements the same credential-store behavior", async () => {
		const storage = AuthStorage.inMemory({ litellm: { type: "api_key", key: "initial" } });
		expect(await storage.read("litellm")).toEqual({ type: "api_key", key: "initial" });
		await storage.modify("litellm", async () => ({ type: "api_key", key: "updated" }));
		expect(await storage.read("litellm")).toEqual({ type: "api_key", key: "updated" });
		await storage.delete("litellm");
		await expect(storage.list()).resolves.toEqual([]);
	});

	test("does not write after lock acquisition failure and recovers on retry", async () => {
		writeAuthJson({ litellm: { type: "api_key", key: "stored" } });
		const storage = AuthStorage.create(authJsonPath);
		const lockSpy = vi.spyOn(lockfile, "lock").mockRejectedValueOnce(new Error("lock unavailable"));

		await expect(storage.modify("auxiliary", async () => ({ type: "api_key", key: "new" }))).rejects.toThrow(
			"lock unavailable",
		);
		expect(JSON.parse(readFileSync(authJsonPath, "utf8"))).toEqual({
			litellm: { type: "api_key", key: "stored" },
		});

		lockSpy.mockRestore();
		await storage.modify("auxiliary", async () => ({ type: "api_key", key: "new" }));
		expect(JSON.parse(readFileSync(authJsonPath, "utf8"))).toEqual({
			litellm: { type: "api_key", key: "stored" },
			auxiliary: { type: "api_key", key: "new" },
		});
	});

	test("does not overwrite malformed auth files", async () => {
		writeAuthJson({ litellm: { type: "api_key", key: "stored" } });
		const storage = AuthStorage.create(authJsonPath);
		writeFileSync(authJsonPath, "{invalid-json", "utf8");
		await expect(storage.modify("auxiliary", async () => ({ type: "api_key", key: "new" }))).rejects.toThrow();
		expect(readFileSync(authJsonPath, "utf8")).toBe("{invalid-json");
	});
});
