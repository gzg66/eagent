import { describe, expect, it } from "vitest";
import { PolicyEngine, redactSecrets, type ToolPolicyRequest } from "../src/index.ts";

const highRiskRequest: ToolPolicyRequest = {
	toolName: "shell",
	toolCallId: "call-1",
	arguments: { command: "build" },
	descriptor: {
		risk: "high",
		resources: [{ kind: "process", access: "execute" }],
	},
	interactive: true,
};

describe("PolicyEngine", () => {
	it("supports allow, block, rewrite, and review decisions", async () => {
		const allow = new PolicyEngine({ evaluate: () => ({ type: "allow" }) });
		expect(await allow.decide(highRiskRequest)).toEqual({ type: "allow" });

		const block = new PolicyEngine({ evaluate: () => ({ type: "block", reason: "denied" }) });
		expect(await block.decide(highRiskRequest)).toEqual({ type: "block", reason: "denied" });

		const rewrite = new PolicyEngine({
			evaluate: () => ({ type: "rewrite", arguments: { command: "check" } }),
		});
		expect(await rewrite.decide(highRiskRequest)).toEqual({
			type: "rewrite",
			arguments: { command: "check" },
		});

		const review = new PolicyEngine({ evaluate: () => ({ type: "review", reason: "approval required" }) });
		expect(await review.decide(highRiskRequest, () => ({ type: "allow", reason: "approved" }))).toEqual({
			type: "allow",
			reason: "approved",
		});
	});

	it("uses a blocking default when review is unavailable", async () => {
		const engine = new PolicyEngine({ evaluate: () => ({ type: "review" }) });
		expect(await engine.decide({ ...highRiskRequest, interactive: false })).toEqual({
			type: "block",
			reason: "Approval is unavailable in non-interactive mode",
		});
	});

	it("redacts credentials without mutating the input", () => {
		const original = { text: "Authorization: Bearer abcdefghijklmnop", nested: ["api_key=secret-value"] };
		const redacted = redactSecrets(original);
		expect(redacted).toEqual({
			text: "Authorization: Bearer [REDACTED]",
			nested: ["api_key=[REDACTED]"],
		});
		expect(original.nested[0]).toBe("api_key=secret-value");
	});
});
