export function getAgentUserAgent(version: string): string {
	const runtime = process.versions.bun ? `bun/${process.versions.bun}` : `node/${process.version}`;
	return `eagent/${version} (${process.platform}; ${runtime}; ${process.arch})`;
}
