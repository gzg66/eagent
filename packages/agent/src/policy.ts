export type PolicyDecisionType = "allow" | "block" | "rewrite" | "review";
export type ToolRiskLevel = "low" | "medium" | "high" | "critical";
export type ResourceAccess = "read" | "write" | "execute" | "connect" | "manage";

export interface ToolResourceScope {
	kind: "filesystem" | "process" | "network" | "session" | "orchestrator" | "other";
	access: ResourceAccess;
	patterns?: string[];
}

export interface ToolPolicyDescriptor {
	risk: ToolRiskLevel;
	resources: ToolResourceScope[];
	description?: string;
}

interface PolicyDecisionBase {
	type: PolicyDecisionType;
	reason?: string;
}

export interface AllowPolicyDecision extends PolicyDecisionBase {
	type: "allow";
}

export interface BlockPolicyDecision extends PolicyDecisionBase {
	type: "block";
}

export interface RewritePolicyDecision extends PolicyDecisionBase {
	type: "rewrite";
	arguments: unknown;
}

export interface ReviewPolicyDecision extends PolicyDecisionBase {
	type: "review";
}

export type PolicyDecision = AllowPolicyDecision | BlockPolicyDecision | RewritePolicyDecision | ReviewPolicyDecision;

export interface ToolPolicyRequest {
	toolName: string;
	toolCallId: string;
	arguments: unknown;
	descriptor: ToolPolicyDescriptor;
	interactive: boolean;
}

export type PolicyEvaluator = (request: ToolPolicyRequest) => PolicyDecision | Promise<PolicyDecision>;

export type PolicyReviewer = (
	request: ToolPolicyRequest,
	decision: ReviewPolicyDecision,
) => Exclude<PolicyDecision, ReviewPolicyDecision> | Promise<Exclude<PolicyDecision, ReviewPolicyDecision>>;

export interface PolicyRedactionHooks {
	beforePersist?: <T>(value: T) => T | Promise<T>;
	finalOutput?: <T>(value: T) => T | Promise<T>;
}

export interface PolicyEngineOptions {
	evaluate?: PolicyEvaluator;
	review?: PolicyReviewer;
	redaction?: PolicyRedactionHooks;
	nonInteractiveReview?: Exclude<PolicyDecision, ReviewPolicyDecision>;
}

const SECRET_PATTERNS: RegExp[] = [
	/\b(sk-[A-Za-z0-9_-]{16,})\b/g,
	/\b(Bearer\s+)[A-Za-z0-9._~+/-]{12,}/gi,
	/\b(api[_-]?key\s*[=:]\s*)[^\s,;]+/gi,
];

function redactString(value: string): string {
	let redacted = value;
	for (const pattern of SECRET_PATTERNS) {
		redacted = redacted.replace(pattern, (_match, prefix?: string) => `${prefix ?? ""}[REDACTED]`);
	}
	return redacted;
}

/** Redact common credential forms from a JSON-compatible value without mutating the input. */
export function redactSecrets<T>(value: T): T {
	if (typeof value === "string") return redactString(value) as T;
	if (Array.isArray(value)) return value.map((entry) => redactSecrets(entry)) as T;
	if (value && typeof value === "object") {
		return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redactSecrets(entry)])) as T;
	}
	return value;
}

function defaultDecision(request: ToolPolicyRequest): PolicyDecision {
	if (request.descriptor.risk === "critical") {
		return { type: "block", reason: "Critical-risk tools are blocked by the default policy" };
	}
	if (request.descriptor.risk === "high") {
		return { type: "review", reason: "High-risk tool execution requires approval" };
	}
	return { type: "allow", reason: `Default ${request.descriptor.risk}-risk policy` };
}

/** Central policy evaluator used by every tool execution surface. */
export class PolicyEngine {
	private readonly evaluator: PolicyEvaluator;
	private readonly reviewer?: PolicyReviewer;
	private readonly redaction: PolicyRedactionHooks;
	private readonly nonInteractiveReview: Exclude<PolicyDecision, ReviewPolicyDecision>;

	constructor(options: PolicyEngineOptions = {}) {
		this.evaluator = options.evaluate ?? defaultDecision;
		this.reviewer = options.review;
		this.redaction = options.redaction ?? {
			beforePersist: redactSecrets,
			finalOutput: redactSecrets,
		};
		this.nonInteractiveReview = options.nonInteractiveReview ?? {
			type: "block",
			reason: "Approval is unavailable in non-interactive mode",
		};
	}

	async decide(
		request: ToolPolicyRequest,
		reviewer?: PolicyReviewer,
	): Promise<Exclude<PolicyDecision, ReviewPolicyDecision>> {
		const decision = await this.evaluator(request);
		if (decision.type !== "review") return decision;
		if (!request.interactive) return this.nonInteractiveReview;
		const effectiveReviewer = reviewer ?? this.reviewer;
		if (!effectiveReviewer) {
			return { type: "block", reason: "No approval reviewer is configured" };
		}
		return effectiveReviewer(request, decision);
	}

	async redactBeforePersist<T>(value: T): Promise<T> {
		return (await this.redaction.beforePersist?.(value)) ?? value;
	}

	async redactFinalOutput<T>(value: T): Promise<T> {
		return (await this.redaction.finalOutput?.(value)) ?? value;
	}
}
