import { execSync, spawn } from "node:child_process";
import { platform } from "node:os";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { copyToClipboard, readClipboardText } from "../src/utils/clipboard.ts";

const mocks = vi.hoisted(() => ({
	execSync: vi.fn(),
	spawn: vi.fn(),
	platform: vi.fn<() => NodeJS.Platform>(),
	isWaylandSession: vi.fn<() => boolean>(),
}));

vi.mock("node:child_process", () => ({ execSync: mocks.execSync, spawn: mocks.spawn }));
vi.mock("node:os", () => ({ platform: mocks.platform }));
vi.mock("../src/utils/clipboard-image.js", () => ({ isWaylandSession: mocks.isWaylandSession }));

const mockedExecSync = vi.mocked(execSync);
const mockedSpawn = vi.mocked(spawn);
const mockedPlatform = vi.mocked(platform);
let originalWrite: typeof process.stdout.write;
let stdoutWrites: string[];

beforeEach(() => {
	vi.unstubAllEnvs();
	stdoutWrites = [];
	mocks.execSync.mockReset();
	mocks.spawn.mockReset();
	mocks.platform.mockReset();
	mocks.isWaylandSession.mockReset();
	mockedPlatform.mockReturnValue("darwin");
	mocks.isWaylandSession.mockReturnValue(false);
	originalWrite = process.stdout.write.bind(process.stdout);
	process.stdout.write = ((chunk: string | Uint8Array) => {
		if (typeof chunk === "string" && chunk.startsWith("\x1b]52;c;")) {
			stdoutWrites.push(chunk);
			return true;
		}
		return originalWrite(chunk);
	}) as typeof process.stdout.write;
});

afterEach(() => {
	process.stdout.write = originalWrite;
	vi.unstubAllEnvs();
});

describe("readClipboardText", () => {
	test("reads text through the platform command", async () => {
		mockedExecSync.mockReturnValue("clipboard text");
		await expect(readClipboardText()).resolves.toBe("clipboard text");
		expect(mockedExecSync).toHaveBeenCalledWith("pbpaste", expect.objectContaining({ encoding: "utf-8" }));
	});

	test("returns null when the platform command is unavailable", async () => {
		mockedExecSync.mockImplementation(() => {
			throw new Error("unavailable");
		});
		await expect(readClipboardText()).resolves.toBeNull();
	});
});

describe("copyToClipboard", () => {
	test("local platform success skips terminal fallback", async () => {
		mockedExecSync.mockReturnValue(Buffer.alloc(0));
		await copyToClipboard("hello");
		expect(mockedExecSync).toHaveBeenCalledWith("pbcopy", expect.objectContaining({ input: "hello" }));
		expect(stdoutWrites).toHaveLength(0);
		expect(mockedSpawn).not.toHaveBeenCalled();
	});

	test("remote sessions also emit the terminal clipboard sequence", async () => {
		vi.stubEnv("SSH_CONNECTION", "client server");
		mockedExecSync.mockReturnValue(Buffer.alloc(0));
		await copyToClipboard("hello");
		expect(stdoutWrites).toHaveLength(1);
	});

	test("uses the terminal fallback when platform tools fail", async () => {
		mockedExecSync.mockImplementation(() => {
			throw new Error("failed");
		});
		await copyToClipboard("hello");
		expect(stdoutWrites).toHaveLength(1);
	});

	test("rejects an oversized terminal fallback payload", async () => {
		mockedExecSync.mockImplementation(() => {
			throw new Error("failed");
		});
		await expect(copyToClipboard("x".repeat(80_000))).rejects.toThrow("Failed to copy to clipboard");
		expect(stdoutWrites).toHaveLength(0);
	});
});
