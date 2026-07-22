import chalk from "chalk";
import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { platform } from "os";
import { join } from "path";
import { getBinDir } from "../config.ts";

type ToolName = "fd" | "rg";

interface ToolConfig {
	name: string;
	binaryName: string;
	systemBinaryNames?: string[];
	installHint: string;
}

const TOOLS: Record<ToolName, ToolConfig> = {
	fd: {
		name: "fd",
		binaryName: "fd",
		systemBinaryNames: ["fd", "fdfind"],
		installHint: "Install fd with your operating system's package manager.",
	},
	rg: {
		name: "ripgrep",
		binaryName: "rg",
		installHint: "Install ripgrep with your operating system's package manager.",
	},
};

function commandExists(command: string): boolean {
	try {
		const result = spawnSync(command, ["--version"], { stdio: "pipe" });
		return result.error === undefined || result.error === null;
	} catch {
		return false;
	}
}

export function getToolPath(tool: ToolName): string | null {
	const config = TOOLS[tool];
	const localPath = join(getBinDir(), config.binaryName + (platform() === "win32" ? ".exe" : ""));
	if (existsSync(localPath)) return localPath;

	for (const binaryName of config.systemBinaryNames ?? [config.binaryName]) {
		if (commandExists(binaryName)) return binaryName;
	}

	return null;
}

/**
 * Resolve an already-installed local tool. This function never accesses the
 * network or installs software.
 */
export async function ensureTool(tool: ToolName, silent: boolean = false): Promise<string | undefined> {
	const existingPath = getToolPath(tool);
	if (existingPath) return existingPath;

	if (!silent) {
		const config = TOOLS[tool];
		console.log(chalk.yellow(`${config.name} is not installed. ${config.installHint}`));
	}
	return undefined;
}
