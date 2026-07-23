/**
 * System prompt construction and project context loading
 */

import { getDocsPath, getExamplesPath, getReadmePath } from "../config.ts";
import { formatSkillsForPrompt, type Skill } from "./skills.ts";

export interface BuildSystemPromptOptions {
	/** Custom system prompt (replaces default). */
	customPrompt?: string;
	/** Tools to include in prompt. Default: [read, bash, edit, write] */
	selectedTools?: string[];
	/** Optional one-line tool snippets keyed by tool name. */
	toolSnippets?: Record<string, string>;
	/** Additional guideline bullets appended to the default system prompt guidelines. */
	promptGuidelines?: string[];
	/** Text to append to system prompt. */
	appendSystemPrompt?: string;
	/** Working directory. */
	cwd: string;
	/** Pre-loaded context files. */
	contextFiles?: Array<{ path: string; content: string }>;
	/** Pre-loaded skills. */
	skills?: Skill[];
}

/** Build the system prompt with tools, guidelines, and context */
export function buildSystemPrompt(options: BuildSystemPromptOptions): string {
	const {
		customPrompt,
		selectedTools,
		toolSnippets,
		promptGuidelines,
		appendSystemPrompt,
		cwd,
		contextFiles: providedContextFiles,
		skills: providedSkills,
	} = options;
	const promptCwd = cwd.replace(/\\/g, "/");

	const appendSection = appendSystemPrompt ? `\n\n${appendSystemPrompt}` : "";

	const contextFiles = providedContextFiles ?? [];
	const skills = providedSkills ?? [];

	if (customPrompt) {
		let prompt = customPrompt;

		if (appendSection) {
			prompt += appendSection;
		}

		// Append project context files
		if (contextFiles.length > 0) {
			prompt += "\n\n<project_context>\n\n";
			prompt += "项目特定的指示和指南：\n\n";
			for (const { path: filePath, content } of contextFiles) {
				prompt += `<project_instructions path="${filePath}">\n${content}\n</project_instructions>\n\n`;
			}
			prompt += "</project_context>\n";
		}

		// Append skills section (only if read tool is available)
		const customPromptHasRead = !selectedTools || selectedTools.includes("read");
		if (customPromptHasRead && skills.length > 0) {
			prompt += formatSkillsForPrompt(skills);
		}

		prompt += `\n当前工作目录：${promptCwd}`;

		return prompt;
	}

	// Get absolute paths to documentation and examples
	const readmePath = getReadmePath();
	const docsPath = getDocsPath();
	const examplesPath = getExamplesPath();

	// Build tools list based on selected tools.
	// A tool appears in Available tools only when the caller provides a one-line snippet.
	const tools = selectedTools || ["read", "bash", "edit", "write"];
	const visibleTools = tools.filter((name) => !!toolSnippets?.[name]);
	const toolsList =
		visibleTools.length > 0 ? visibleTools.map((name) => `- ${name}: ${toolSnippets![name]}`).join("\n") : "(none)";

	// Build guidelines based on which tools are actually available
	const guidelinesList: string[] = [];
	const guidelinesSet = new Set<string>();
	const addGuideline = (guideline: string): void => {
		if (guidelinesSet.has(guideline)) {
			return;
		}
		guidelinesSet.add(guideline);
		guidelinesList.push(guideline);
	};

	const hasBash = tools.includes("bash");
	const hasGrep = tools.includes("grep");
	const hasFind = tools.includes("find");
	const hasLs = tools.includes("ls");
	const hasRead = tools.includes("read");

	// File exploration guidelines
	if (hasBash && !hasGrep && !hasFind && !hasLs) {
		addGuideline("使用 bash 进行文件操作，如 ls、rg、find");
	}

	for (const guideline of promptGuidelines ?? []) {
		const normalized = guideline.trim();
		if (normalized.length > 0) {
			addGuideline(normalized);
		}
	}

	// Always include these
	addGuideline("始终使用简体中文进行思考、推理和回答。代码、标识符、文件路径、shell 命令和技术术语保持原文");
	addGuideline("回复保持简洁精炼");
	addGuideline("处理文件时清晰显示文件路径");

	const guidelines = guidelinesList.map((g) => `- ${g}`).join("\n");

	let prompt = `你是 Reasonix，一个通用型 AI 助手。你通过可配置的工具集和技能系统来帮助用户完成各种任务——包括但不限于编码、写作、数据分析、项目管理等。你的核心能力来自可调用的 skills（技能），每个 skill 提供了特定领域的专业指令。

你的工作方式：
- 当用户给出任务时，首先判断是否有匹配的 skill 可以调用；如果有，优先使用 skill 来引导工作流
- 在没有匹配 skill 的情况下，使用通用知识和可用工具直接帮助用户
- 与用户协作完成任务，在关键决策点上询问确认

可用工具：
${toolsList}

除上述工具外，根据项目配置，你可能还可以访问其他自定义工具。

指南：
${guidelines}

MyAgent 平台文档（仅在用户询问 myagent 本身、其 SDK、扩展、主题、技能或 TUI 时阅读）：
- 主文档：${readmePath}
- 附加文档：${docsPath}
- 示例：${examplesPath}（扩展、自定义工具、SDK）
- 阅读 myagent 文档或示例时，docs/... 路径相对于附加文档目录解析，examples/... 相对于示例目录解析，而非当前工作目录
- 相关主题映射：扩展 (docs/extensions.md, examples/extensions/)、主题 (docs/themes.md)、技能 (docs/skills.md)、提示模板 (docs/prompt-templates.md)、TUI 组件 (docs/tui.md)、快捷键 (docs/keybindings.md)、SDK 集成 (docs/sdk.md)、自定义 provider (docs/custom-provider.md)、添加模型 (docs/models.md)、myagent 包 (docs/packages.md)
- 处理 myagent 相关主题时，先完整阅读文档和示例，再参考 .md 交叉引用，然后才实施
- 始终完整阅读 myagent 的 .md 文件，并跟踪相关文档的链接（例如 tui.md 中的 TUI API 详情）`;

	if (appendSection) {
		prompt += appendSection;
	}

	// Append project context files
	if (contextFiles.length > 0) {
		prompt += "\n\n<project_context>\n\n";
		prompt += "项目特定的指示和指南：\n\n";
		for (const { path: filePath, content } of contextFiles) {
			prompt += `<project_instructions path="${filePath}">\n${content}\n</project_instructions>\n\n`;
		}
		prompt += "</project_context>\n";
	}

	// Append skills section (only if read tool is available)
	if (hasRead && skills.length > 0) {
		prompt += formatSkillsForPrompt(skills);
	}

	prompt += `\n当前工作目录：${promptCwd}`;

	return prompt;
}
