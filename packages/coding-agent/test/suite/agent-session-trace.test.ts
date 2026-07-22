import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentTool } from "@enterprise-agent/agent-core";
import { fauxAssistantMessage, fauxToolCall } from "@enterprise-agent/ai/compat";
import { Type } from "typebox";
import { afterEach, describe, expect, it } from "vitest";
import { createSyntheticSourceInfo } from "../../src/core/source-info.ts";
import type { TraceEvent } from "../../src/core/trace.ts";
import { createTestResourceLoader } from "../utilities.ts";
import { createHarness, type Harness } from "./harness.ts";

function eventFor(events: readonly TraceEvent[], name: string, phase: TraceEvent["phase"]): TraceEvent {
	const event = events.find((candidate) => candidate.name === name && candidate.phase === phase);
	if (!event) throw new Error(`Missing ${phase} event for ${name}`);
	return event;
}

describe("AgentSession trace", () => {
	const harnesses: Harness[] = [];
	const tempDirs: string[] = [];

	afterEach(() => {
		while (harnesses.length > 0) harnesses.pop()?.cleanup();
		while (tempDirs.length > 0) {
			const tempDir = tempDirs.pop();
			if (tempDir) rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("persists a safe session-agent-turn-tool causal tree", async () => {
		const echoTool: AgentTool = {
			name: "echo",
			label: "Echo",
			description: "Echo text",
			parameters: Type.Object({ text: Type.String() }),
			execute: async (_toolCallId, params) => {
				const text = typeof params === "object" && params !== null && "text" in params ? String(params.text) : "";
				return {
					content: [{ type: "text", text }],
					details: {},
				};
			},
		};
		const harness = await createHarness({ tools: [echoTool], persistSession: true });
		harnesses.push(harness);
		harness.setResponses([
			fauxAssistantMessage(fauxToolCall("echo", { text: "secret-tool-argument" }), {
				stopReason: "toolUse",
			}),
			fauxAssistantMessage("done"),
		]);

		await harness.session.prompt("secret-user-prompt");

		const events = harness.session.traceEvents;
		const sessionStart = eventFor(events, "agent.session.turn", "start");
		const sessionEnd = eventFor(events, "agent.session.turn", "end");
		const agentStart = eventFor(events, "agent.agent.run", "start");
		const turnStart = eventFor(events, "agent.agent.turn", "start");
		const toolStart = eventFor(events, "agent.agent.tool_call", "start");
		const toolEnd = eventFor(events, "agent.agent.tool_call", "end");

		expect(new Set(events.map((event) => event.traceId))).toEqual(new Set([sessionStart.traceId]));
		expect(agentStart.parentSpanId).toBe(sessionStart.spanId);
		expect(turnStart.parentSpanId).toBe(agentStart.spanId);
		expect(toolStart.parentSpanId).toBe(turnStart.spanId);
		expect(toolEnd.spanId).toBe(toolStart.spanId);
		expect(toolEnd.status).toBe("ok");
		expect(sessionEnd.spanId).toBe(sessionStart.spanId);
		expect(sessionEnd.status).toBe("ok");
		expect(sessionEnd.durationMs).toEqual(expect.any(Number));
		expect(harness.eventsOfType("trace_event").map(({ event }) => event)).toEqual(events);

		const traceFile = harness.session.traceFile;
		expect(traceFile).toBeDefined();
		expect(traceFile && existsSync(traceFile)).toBe(true);
		const persisted = readFileSync(traceFile!, "utf-8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as TraceEvent);
		expect(persisted).toEqual(events);
		const serialized = JSON.stringify(persisted);
		expect(serialized).not.toContain("secret-user-prompt");
		expect(serialized).not.toContain("secret-tool-argument");
		expect(harness.session.traceWriteError).toBeUndefined();
	});

	it("records explicit skill spans and isolates trace listener failures", async () => {
		const tempDir = join(tmpdir(), `agent-trace-skill-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(tempDir, { recursive: true });
		tempDirs.push(tempDir);
		const skillPath = join(tempDir, "SKILL.md");
		writeFileSync(skillPath, "# Trace skill\n\nPerform the requested task.");
		const resourceLoader = {
			...createTestResourceLoader(),
			getSkills: () => ({
				skills: [
					{
						name: "trace-skill",
						description: "Trace test skill",
						filePath: skillPath,
						disableModelInvocation: false,
						baseDir: tempDir,
						sourceInfo: createSyntheticSourceInfo(skillPath, {
							source: "local",
							scope: "project",
							origin: "top-level",
							baseDir: tempDir,
						}),
					},
				],
				diagnostics: [],
			}),
		};
		const harness = await createHarness({ resourceLoader });
		harnesses.push(harness);
		harness.setResponses([fauxAssistantMessage("ok")]);
		const downstreamTraceEvents: TraceEvent[] = [];
		harness.session.subscribe((event) => {
			if (event.type === "trace_event") throw new Error("passive subscriber failure");
		});
		harness.session.subscribe((event) => {
			if (event.type === "trace_event") downstreamTraceEvents.push(event.event);
		});

		await expect(harness.session.prompt("/skill:trace-skill run")).resolves.toBeUndefined();

		const events = harness.session.traceEvents;
		const sessionStart = eventFor(events, "agent.session.turn", "start");
		const skillStart = eventFor(events, "agent.agent.skill", "start");
		const skillEnd = eventFor(events, "agent.agent.skill", "end");
		expect(skillStart.parentSpanId).toBe(sessionStart.spanId);
		expect(skillStart.attributes).toEqual({ skillName: "trace-skill" });
		expect(skillEnd.spanId).toBe(skillStart.spanId);
		expect(skillEnd.status).toBe("ok");
		expect(downstreamTraceEvents).toEqual(events);
		expect(harness.session.messages.at(-1)?.role).toBe("assistant");
	});

	it("keeps failed retry attempts while reporting the recovered session turn as successful", async () => {
		const harness = await createHarness({
			settings: { retry: { enabled: true, maxRetries: 1, baseDelayMs: 1 } },
		});
		harnesses.push(harness);
		harness.setResponses([
			fauxAssistantMessage("", { stopReason: "error", errorMessage: "overloaded_error" }),
			fauxAssistantMessage("recovered"),
		]);

		await harness.session.prompt("retry");

		const events = harness.session.traceEvents;
		const agentEnds = events.filter((event) => event.name === "agent.agent.run" && event.phase === "end");
		expect(agentEnds.map((event) => event.status)).toEqual(["error", "ok"]);
		expect(eventFor(events, "agent.session.turn", "end").status).toBe("ok");
		expect(new Set(events.map((event) => event.traceId))).toHaveLength(1);
	});
});
