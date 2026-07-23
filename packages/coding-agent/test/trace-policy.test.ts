import { describe, expect, it } from "vitest";
import { SessionTrace } from "../src/core/trace.ts";

describe("policy trace", () => {
	it("records every policy decision as a causal policy span", () => {
		const trace = new SessionTrace({ sessionId: "session-1" });
		trace.start({ source: "test" });
		trace.recordPolicyDecision({ toolName: "bash", decision: "block", risk: "high" });
		trace.finish();
		const policyEvents = trace.getEvents().filter((event) => event.kind === "policy");
		expect(policyEvents.map((event) => event.phase)).toEqual(["start", "end"]);
		expect(policyEvents[1]?.status).toBe("aborted");
	});
});
