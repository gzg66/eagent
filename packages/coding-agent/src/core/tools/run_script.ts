import type { AgentTool } from "@enterprise-agent/agent-core";
import { Container, Text } from "@enterprise-agent/tui";
import { spawn } from "child_process";
import { type Static, Type } from "typebox";
import { theme } from "../../modes/interactive/theme/theme.ts";
import { waitForChildProcess } from "../../utils/child-process.ts";
import { getShellEnv, killProcessTree, trackDetachedChildPid, untrackDetachedChildPid } from "../../utils/shell.ts";
import type { ToolDefinition, ToolRenderResultOptions } from "../extensions/types.ts";
import { OutputAccumulator } from "./output-accumulator.ts";
import { getTextOutput, str } from "./render-utils.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, type TruncationResult } from "./truncate.ts";

const runScriptSchema = Type.Object({
	script: Type.String({ description: "Path to the Python script to execute" }),
	args: Type.Optional(
		Type.Array(Type.String(), {
			description:
				'Arguments to pass to the script. Each argument is a separate string, e.g. ["--input", "file.txt", "--verbose"]',
		}),
	),
});

export type RunScriptInput = Static<typeof runScriptSchema>;

export interface RunScriptDetails {
	truncation?: TruncationResult;
	fullOutputPath?: string;
}

export interface RunScriptOptions {
	pythonPath?: string;
	env?: NodeJS.ProcessEnv;
}

type RunScriptRenderState = {
	startedAt: number | undefined;
	endedAt: number | undefined;
	interval: NodeJS.Timeout | undefined;
};

type RunScriptResultRenderState = {
	cachedWidth: number | undefined;
	cachedLines: string[] | undefined;
	cachedSkipped: number | undefined;
};

class RunScriptResultRenderComponent extends Container {
	state: RunScriptResultRenderState = {
		cachedWidth: undefined,
		cachedLines: undefined,
		cachedSkipped: undefined,
	};
}

function formatDuration(ms: number): string {
	return `${(ms / 1000).toFixed(1)}s`;
}

function formatRunScriptCall(args: { script?: string; args?: string[] } | undefined): string {
	const scriptPath = str(args?.script);
	const extraArgs = args?.args?.length ? ` ${args.args.join(" ")}` : "";
	const display = scriptPath === null ? theme.fg("toolOutput", "...") : `python3 ${scriptPath}${extraArgs}`;
	return theme.fg("toolTitle", theme.bold(`$ ${display}`));
}

function rebuildRunScriptResultRenderComponent(
	component: RunScriptResultRenderComponent,
	result: {
		content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
		details?: RunScriptDetails;
	},
	options: ToolRenderResultOptions,
	showImages: boolean,
	startedAt: number | undefined,
	endedAt: number | undefined,
): void {
	component.clear();

	let output = getTextOutput(result as any, showImages).trim();
	const truncation = result.details?.truncation;
	const fullOutputPath = result.details?.fullOutputPath;
	if (!options.isPartial && truncation?.truncated && fullOutputPath && output.endsWith("]")) {
		const footerStart = output.lastIndexOf("\n\n[");
		if (footerStart !== -1 && output.slice(footerStart).includes(fullOutputPath)) {
			output = output.slice(0, footerStart).trimEnd();
		}
	}

	if (output) {
		const styledOutput = output
			.split("\n")
			.map((line) => theme.fg("toolOutput", line))
			.join("\n");
		component.addChild(new Text(`\n${styledOutput}`, 0, 0));
	}

	if (!options.isPartial && truncation?.truncated) {
		const sizeInfo = truncation.outputBytes
			? ` (${formatSize(truncation.outputBytes)} / ${formatSize(truncation.totalBytes)} bytes)`
			: "";
		const lineInfo = truncation.totalLines
			? ` — last ${truncation.outputLines} of ${truncation.totalLines} lines${sizeInfo}`
			: sizeInfo;
		const fileInfo = fullOutputPath ? ` Full output saved to: ${fullOutputPath}` : "";
		component.addChild(new Text(`\n${theme.fg("muted", `[Output truncated${lineInfo}]${fileInfo}`)}`, 0, 0));
	}

	if (startedAt !== undefined && !options.isPartial) {
		const end = endedAt ?? Date.now();
		const duration = formatDuration(end - startedAt);
		component.addChild(new Text(`\n${theme.fg("muted", `Duration: ${duration}`)}`, 0, 0));
	}
}

export function createRunScriptToolDefinition(
	cwd: string,
	options?: RunScriptOptions,
): ToolDefinition<typeof runScriptSchema, RunScriptDetails | undefined, RunScriptRenderState> {
	const pythonPath = options?.pythonPath ?? "python3";
	const env = options?.env;

	return {
		name: "run_script",
		label: "run_script",
		description: `Execute a Python script with optional arguments. Runs "python3 <script> [args...]" and returns stdout and stderr. Output is truncated to last ${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). If truncated, full output is saved to a temp file.`,
		promptSnippet: "Run a Python script (python3 <script> [args...])",
		parameters: runScriptSchema,
		async execute(
			_toolCallId,
			{ script, args }: { script: string; args?: string[] },
			signal?: AbortSignal,
			onUpdate?,
			_ctx?,
		) {
			const scriptArgs = args ?? [];
			const output = new OutputAccumulator({ tempFilePrefix: "agent-run-script" });
			let acceptingOutput = true;

			const handleData = (data: Buffer) => {
				if (!acceptingOutput) return;
				output.append(data);
				if (onUpdate) {
					const snapshot = output.snapshot({ persistIfTruncated: true });
					onUpdate({
						content: [{ type: "text", text: snapshot.content || "" }],
						details: {
							truncation: snapshot.truncation.truncated ? snapshot.truncation : undefined,
							fullOutputPath: snapshot.fullOutputPath,
						},
					});
				}
			};

			if (onUpdate) {
				onUpdate({ content: [], details: undefined });
			}

			const child = spawn(pythonPath, [script, ...scriptArgs], {
				cwd,
				detached: process.platform !== "win32",
				env: env ? { ...getShellEnv(), ...env } : getShellEnv(),
				stdio: ["ignore", "pipe", "pipe"],
				windowsHide: true,
			});

			if (child.pid) trackDetachedChildPid(child.pid);

			const onAbort = () => {
				if (child.pid) killProcessTree(child.pid);
			};

			if (signal) {
				if (signal.aborted) onAbort();
				else signal.addEventListener("abort", onAbort, { once: true });
			}

			try {
				child.stdout?.on("data", handleData);
				child.stderr?.on("data", handleData);

				const exitCode = await waitForChildProcess(child);

				if (signal?.aborted) {
					throw new Error("aborted");
				}

				acceptingOutput = false;
				output.finish();
				const snapshot = output.snapshot({ persistIfTruncated: true });
				await output.closeTempFile();

				if (exitCode !== 0 && exitCode !== null) {
					throw new Error(`Python script exited with code ${exitCode}`);
				}

				return {
					content: [{ type: "text", text: snapshot.content || "" }],
					details: {
						truncation: snapshot.truncation.truncated ? snapshot.truncation : undefined,
						fullOutputPath: snapshot.fullOutputPath,
					},
				};
			} catch (error) {
				acceptingOutput = false;
				output.finish();
				const snapshot = output.snapshot({ persistIfTruncated: true });
				await output.closeTempFile();

				const err = error instanceof Error ? error : new Error(String(error));
				const message = snapshot.content ? `${err.message}\n\n${snapshot.content}` : err.message;

				throw new Error(message);
			} finally {
				if (child.pid) untrackDetachedChildPid(child.pid);
				if (signal) signal.removeEventListener("abort", onAbort);
			}
		},

		renderCall(args, _theme, context) {
			context.state ??= { startedAt: Date.now(), endedAt: undefined, interval: undefined };
			return new Text(formatRunScriptCall(args), 0, 0);
		},

		renderResult(result, options, _theme, context) {
			const state = context.state;
			if (state.startedAt !== undefined && options.isPartial && !state.interval) {
				state.interval = setInterval(() => context.invalidate(), 1000);
			}
			if (!options.isPartial || context.isError) {
				state.endedAt ??= Date.now();
				if (state.interval) {
					clearInterval(state.interval);
					state.interval = undefined;
				}
			}
			const component =
				(context.lastComponent as RunScriptResultRenderComponent | undefined) ??
				new RunScriptResultRenderComponent();
			rebuildRunScriptResultRenderComponent(
				component,
				result as any,
				options,
				context.showImages,
				state.startedAt,
				state.endedAt,
			);
			component.invalidate();
			return component;
		},
	};
}

export function createRunScriptTool(cwd: string, options?: RunScriptOptions): AgentTool<typeof runScriptSchema> {
	return wrapToolDefinition(createRunScriptToolDefinition(cwd, options));
}
