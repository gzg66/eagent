import { describe, expect, it } from "vitest";
import { getAgentUserAgent } from "../src/utils/agent-user-agent.ts";

describe("getAgentUserAgent", () => {
	it("formats the Enterprise Agent user agent", () => {
		const runtime = process.versions.bun ? `bun/${process.versions.bun}` : `node/${process.version}`;
		const userAgent = getAgentUserAgent("1.2.3");

		expect(userAgent).toBe(`eagent/1.2.3 (${process.platform}; ${runtime}; ${process.arch})`);
		expect(userAgent).toMatch(/^eagent\/[^\s()]+ \([^;()]+;\s*[^;()]+;\s*[^()]+\)$/);
	});
});
