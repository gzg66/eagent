export {
	type BashOperations,
	type BashSpawnContext,
	type BashSpawnHook,
	type BashToolDetails,
	type BashToolInput,
	type BashToolOptions,
	createBashTool,
	createBashToolDefinition,
	createLocalBashOperations,
} from "./bash.ts";
export {
	createEditTool,
	createEditToolDefinition,
	type EditOperations,
	type EditToolDetails,
	type EditToolInput,
	type EditToolOptions,
} from "./edit.ts";
export { withFileMutationQueue } from "./file-mutation-queue.ts";
export {
	createFindTool,
	createFindToolDefinition,
	type FindOperations,
	type FindToolDetails,
	type FindToolInput,
	type FindToolOptions,
} from "./find.ts";
export {
	createGrepTool,
	createGrepToolDefinition,
	type GrepOperations,
	type GrepToolDetails,
	type GrepToolInput,
	type GrepToolOptions,
} from "./grep.ts";
export {
	createLsTool,
	createLsToolDefinition,
	type LsOperations,
	type LsToolDetails,
	type LsToolInput,
	type LsToolOptions,
} from "./ls.ts";
export {
	createReadTool,
	createReadToolDefinition,
	type ReadOperations,
	type ReadToolDetails,
	type ReadToolInput,
	type ReadToolOptions,
} from "./read.ts";
export {
	createRunScriptTool,
	createRunScriptToolDefinition,
	type RunScriptDetails,
	type RunScriptInput,
	type RunScriptOptions,
} from "./run_script.ts";
export {
	createSubagentTool,
	createSubagentToolDefinitions,
	type SubagentToolDetails,
	type SubagentToolOptions,
} from "./subagent.ts";
export {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	type TruncationOptions,
	type TruncationResult,
	truncateHead,
	truncateLine,
	truncateTail,
} from "./truncate.ts";
export {
	createWriteTool,
	createWriteToolDefinition,
	type WriteOperations,
	type WriteToolInput,
	type WriteToolOptions,
} from "./write.ts";

import type { AgentTool, ToolPolicyDescriptor } from "@enterprise-agent/agent-core";
import type { ToolDefinition } from "../extensions/types.ts";
import { type BashToolOptions, createBashTool, createBashToolDefinition } from "./bash.ts";
import { createEditTool, createEditToolDefinition, type EditToolOptions } from "./edit.ts";
import { createFindTool, createFindToolDefinition, type FindToolOptions } from "./find.ts";
import { createGrepTool, createGrepToolDefinition, type GrepToolOptions } from "./grep.ts";
import { createLsTool, createLsToolDefinition, type LsToolOptions } from "./ls.ts";
import { createReadTool, createReadToolDefinition, type ReadToolOptions } from "./read.ts";
import { createRunScriptTool, createRunScriptToolDefinition, type RunScriptOptions } from "./run_script.ts";
import { createSubagentTool, createSubagentToolDefinitions, type SubagentToolOptions } from "./subagent.ts";
import { createWriteTool, createWriteToolDefinition, type WriteToolOptions } from "./write.ts";

export type Tool = AgentTool<any>;
export type ToolDef = ToolDefinition<any, any>;
export type ToolName =
	| "read"
	| "run_script"
	| "bash"
	| "edit"
	| "write"
	| "grep"
	| "find"
	| "ls"
	| "spawn_agent"
	| "wait_agent"
	| "cancel_agent"
	| "retry_agent"
	| "list_agents";
export const allToolNames: Set<ToolName> = new Set([
	"read",
	"run_script",
	"bash",
	"edit",
	"write",
	"grep",
	"find",
	"ls",
	"spawn_agent",
	"wait_agent",
	"cancel_agent",
	"retry_agent",
	"list_agents",
]);

export const BUILTIN_TOOL_POLICIES: Record<ToolName, ToolPolicyDescriptor> = {
	run_script: {
		risk: "medium",
		resources: [
			{ kind: "process", access: "execute" },
			{ kind: "filesystem", access: "read", patterns: ["cwd/**"] },
		],
	},
	read: { risk: "low", resources: [{ kind: "filesystem", access: "read", patterns: ["cwd/**"] }] },
	grep: { risk: "low", resources: [{ kind: "filesystem", access: "read", patterns: ["cwd/**"] }] },
	find: { risk: "low", resources: [{ kind: "filesystem", access: "read", patterns: ["cwd/**"] }] },
	ls: { risk: "low", resources: [{ kind: "filesystem", access: "read", patterns: ["cwd/**"] }] },
	edit: { risk: "medium", resources: [{ kind: "filesystem", access: "write", patterns: ["cwd/**"] }] },
	write: { risk: "medium", resources: [{ kind: "filesystem", access: "write", patterns: ["cwd/**"] }] },
	bash: {
		risk: "high",
		resources: [
			{ kind: "process", access: "execute" },
			{ kind: "filesystem", access: "write", patterns: ["cwd/**"] },
		],
	},
	spawn_agent: {
		risk: "high",
		resources: [
			{ kind: "orchestrator", access: "manage" },
			{ kind: "process", access: "execute" },
		],
	},
	wait_agent: { risk: "low", resources: [{ kind: "orchestrator", access: "read" }] },
	cancel_agent: { risk: "medium", resources: [{ kind: "orchestrator", access: "manage" }] },
	retry_agent: { risk: "medium", resources: [{ kind: "orchestrator", access: "manage" }] },
	list_agents: { risk: "low", resources: [{ kind: "orchestrator", access: "read" }] },
};

function declareDefinitionPolicy(toolName: ToolName, definition: ToolDef): ToolDef {
	return { ...definition, policy: BUILTIN_TOOL_POLICIES[toolName] };
}

function declareToolPolicy(toolName: ToolName, tool: Tool): Tool {
	return { ...tool, policy: BUILTIN_TOOL_POLICIES[toolName] };
}

export interface ToolsOptions {
	read?: ReadToolOptions;
	run_script?: RunScriptOptions;
	bash?: BashToolOptions;
	write?: WriteToolOptions;
	edit?: EditToolOptions;
	grep?: GrepToolOptions;
	find?: FindToolOptions;
	ls?: LsToolOptions;
	subagent?: SubagentToolOptions;
}

export function createToolDefinition(toolName: ToolName, cwd: string, options?: ToolsOptions): ToolDef {
	switch (toolName) {
		case "read":
			return declareDefinitionPolicy(toolName, createReadToolDefinition(cwd, options?.read));
		case "run_script":
			return declareDefinitionPolicy(toolName, createRunScriptToolDefinition(cwd, options?.run_script));
		case "bash":
			return declareDefinitionPolicy(toolName, createBashToolDefinition(cwd, options?.bash));
		case "edit":
			return declareDefinitionPolicy(toolName, createEditToolDefinition(cwd, options?.edit));
		case "write":
			return declareDefinitionPolicy(toolName, createWriteToolDefinition(cwd, options?.write));
		case "grep":
			return declareDefinitionPolicy(toolName, createGrepToolDefinition(cwd, options?.grep));
		case "find":
			return declareDefinitionPolicy(toolName, createFindToolDefinition(cwd, options?.find));
		case "ls":
			return declareDefinitionPolicy(toolName, createLsToolDefinition(cwd, options?.ls));
		case "spawn_agent":
		case "wait_agent":
		case "cancel_agent":
		case "retry_agent":
		case "list_agents":
			return declareDefinitionPolicy(toolName, createSubagentToolDefinitions(cwd, options?.subagent)[toolName]);
		default:
			throw new Error(`Unknown tool name: ${toolName}`);
	}
}

export function createTool(toolName: ToolName, cwd: string, options?: ToolsOptions): Tool {
	switch (toolName) {
		case "read":
			return declareToolPolicy(toolName, createReadTool(cwd, options?.read));
		case "run_script":
			return declareToolPolicy(toolName, createRunScriptTool(cwd, options?.run_script));
		case "bash":
			return declareToolPolicy(toolName, createBashTool(cwd, options?.bash));
		case "edit":
			return declareToolPolicy(toolName, createEditTool(cwd, options?.edit));
		case "write":
			return declareToolPolicy(toolName, createWriteTool(cwd, options?.write));
		case "grep":
			return declareToolPolicy(toolName, createGrepTool(cwd, options?.grep));
		case "find":
			return declareToolPolicy(toolName, createFindTool(cwd, options?.find));
		case "ls":
			return declareToolPolicy(toolName, createLsTool(cwd, options?.ls));
		case "spawn_agent":
		case "wait_agent":
		case "cancel_agent":
		case "retry_agent":
		case "list_agents":
			return declareToolPolicy(toolName, createSubagentTool(toolName, cwd, options?.subagent));
		default:
			throw new Error(`Unknown tool name: ${toolName}`);
	}
}

export function createCodingToolDefinitions(cwd: string, options?: ToolsOptions): ToolDef[] {
	return (["read", "bash", "edit", "write", "run_script"] as const).map((name) =>
		createToolDefinition(name, cwd, options),
	);
}

export function createReadOnlyToolDefinitions(cwd: string, options?: ToolsOptions): ToolDef[] {
	return (["read", "grep", "find", "ls"] as const).map((name) => createToolDefinition(name, cwd, options));
}

export function createAllToolDefinitions(cwd: string, options?: ToolsOptions): Record<ToolName, ToolDef> {
	return {
		read: createToolDefinition("read", cwd, options),
		run_script: createToolDefinition("run_script", cwd, options),
		bash: createToolDefinition("bash", cwd, options),
		edit: createToolDefinition("edit", cwd, options),
		write: createToolDefinition("write", cwd, options),
		grep: createToolDefinition("grep", cwd, options),
		find: createToolDefinition("find", cwd, options),
		ls: createToolDefinition("ls", cwd, options),
		spawn_agent: createToolDefinition("spawn_agent", cwd, options),
		wait_agent: createToolDefinition("wait_agent", cwd, options),
		cancel_agent: createToolDefinition("cancel_agent", cwd, options),
		retry_agent: createToolDefinition("retry_agent", cwd, options),
		list_agents: createToolDefinition("list_agents", cwd, options),
	};
}

export function createCodingTools(cwd: string, options?: ToolsOptions): Tool[] {
	return (
		[
			"read",
			"bash",
			"edit",
			"write",
			"run_script",
			"spawn_agent",
			"wait_agent",
			"cancel_agent",
			"retry_agent",
			"list_agents",
		] as const
	).map((name) => createTool(name, cwd, options));
}

export function createReadOnlyTools(cwd: string, options?: ToolsOptions): Tool[] {
	return (["read", "grep", "find", "ls"] as const).map((name) => createTool(name, cwd, options));
}

export function createAllTools(cwd: string, options?: ToolsOptions): Record<ToolName, Tool> {
	return {
		read: createTool("read", cwd, options),
		run_script: createTool("run_script", cwd, options),
		bash: createTool("bash", cwd, options),
		edit: createTool("edit", cwd, options),
		write: createTool("write", cwd, options),
		grep: createTool("grep", cwd, options),
		find: createTool("find", cwd, options),
		ls: createTool("ls", cwd, options),
		spawn_agent: createTool("spawn_agent", cwd, options),
		wait_agent: createTool("wait_agent", cwd, options),
		cancel_agent: createTool("cancel_agent", cwd, options),
		retry_agent: createTool("retry_agent", cwd, options),
		list_agents: createTool("list_agents", cwd, options),
	};
}
