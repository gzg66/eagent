import { execSync, spawn } from "node:child_process";
import { platform } from "node:os";
import { isWaylandSession } from "./clipboard-image.ts";

type ClipboardExecOptions = {
	input?: string;
	encoding?: BufferEncoding;
	timeout: number;
	stdio?: ["pipe", "ignore" | "pipe", "ignore"];
};

const MAX_OSC52_ENCODED_LENGTH = 100_000;

function isRemoteSession(env: NodeJS.ProcessEnv = process.env): boolean {
	return Boolean(env.SSH_CONNECTION || env.SSH_CLIENT || env.MOSH_CONNECTION);
}

function emitOsc52(text: string): boolean {
	const encoded = Buffer.from(text).toString("base64");
	if (encoded.length > MAX_OSC52_ENCODED_LENGTH) return false;
	process.stdout.write(`\x1b]52;c;${encoded}\x07`);
	return true;
}

function readCommand(command: string): string | null {
	try {
		const output = execSync(command, { encoding: "utf-8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] });
		return output || null;
	} catch {
		return null;
	}
}

/** Read plain text from the system clipboard using operating-system tools. */
export async function readClipboardText(): Promise<string | null> {
	const currentPlatform = platform();
	if (currentPlatform === "darwin") return readCommand("pbpaste");
	if (currentPlatform === "win32") {
		return readCommand('powershell.exe -NoProfile -NonInteractive -Command "Get-Clipboard -Raw"');
	}
	if (process.env.TERMUX_VERSION) return readCommand("termux-clipboard-get");
	if (isWaylandSession()) return readCommand("wl-paste --no-newline") ?? readCommand("xclip -selection clipboard -o");
	return readCommand("xclip -selection clipboard -o") ?? readCommand("xsel --clipboard --output");
}

function copyToX11Clipboard(options: ClipboardExecOptions): void {
	try {
		execSync("xclip -selection clipboard", options);
	} catch {
		execSync("xsel --clipboard --input", options);
	}
}

export async function copyToClipboard(text: string): Promise<void> {
	let copied = false;
	const currentPlatform = platform();
	const options: ClipboardExecOptions = {
		input: text,
		timeout: 5000,
		stdio: ["pipe", "ignore", "ignore"],
	};

	try {
		if (currentPlatform === "darwin") {
			execSync("pbcopy", options);
			copied = true;
		} else if (currentPlatform === "win32") {
			execSync("clip", options);
			copied = true;
		} else if (process.env.TERMUX_VERSION) {
			execSync("termux-clipboard-set", options);
			copied = true;
		} else if (isWaylandSession() && process.env.WAYLAND_DISPLAY) {
			execSync("which wl-copy", { stdio: "ignore" });
			const child = spawn("wl-copy", [], { stdio: ["pipe", "ignore", "ignore"] });
			child.stdin.on("error", () => {});
			child.stdin.write(text);
			child.stdin.end();
			child.unref();
			copied = true;
		} else if (process.env.DISPLAY) {
			copyToX11Clipboard(options);
			copied = true;
		}
	} catch {
		// Fall through to the terminal clipboard protocol.
	}

	if (isRemoteSession() || !copied) copied = emitOsc52(text) || copied;
	if (!copied) throw new Error("Failed to copy to clipboard");
}
