import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { SessionManager as CoreSessionManager } from "@enterprise-agent/coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import { SessionManager } from "../server/src/session-manager.ts";

const tempDirs: string[] = [];
const managers: SessionManager[] = [];

afterEach(async () => {
	await Promise.all(managers.splice(0).map((manager) => manager.shutdown()));
	for (const tempDir of tempDirs.splice(0)) {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

function createTempDir(): string {
	const tempDir = mkdtempSync(join(tmpdir(), "eagent-web-session-"));
	tempDirs.push(tempDir);
	return tempDir;
}

describe("Web SessionManager persistence", () => {
	it("restores the session list without starting or selecting a runtime", async () => {
		const cwd = createTempDir();
		const sessionDir = join(cwd, ".eagent", "sessions");
		const first = new SessionManager({ cwd, sessionDir });
		managers.push(first);
		await first.initialize();
		const created = await first.createSession();

		const persisted = await CoreSessionManager.list(cwd, sessionDir);
		expect(persisted).toHaveLength(1);
		expect(persisted[0]?.id).toBe(created.id);
		expect(basename(persisted[0]?.path ?? "")).toBe("session.jsonl");
		expect(existsSync(join(dirname(persisted[0]?.path ?? ""), "skills"))).toBe(true);
		await first.shutdown();
		managers.splice(managers.indexOf(first), 1);

		const restarted = new SessionManager({ cwd, sessionDir });
		managers.push(restarted);
		await restarted.initialize();

		expect(restarted.listSessions()).toEqual([expect.objectContaining({ id: created.id })]);
	});

	it("deletes the exact session workspace", async () => {
		const cwd = createTempDir();
		const manager = new SessionManager({
			cwd,
			sessionDir: join(cwd, ".eagent", "sessions"),
		});
		managers.push(manager);
		await manager.initialize();
		const created = await manager.createSession();
		const [persisted] = await CoreSessionManager.list(cwd, join(cwd, ".eagent", "sessions"));
		const workspace = dirname(persisted?.path ?? "");

		await expect(manager.deleteSession(created.id)).resolves.toBe(true);
		expect(existsSync(workspace)).toBe(false);
	});
});
