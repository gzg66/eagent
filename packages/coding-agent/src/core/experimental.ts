export function areExperimentalFeaturesEnabled(): boolean {
	return process.env.EAGENT_EXPERIMENTAL === "1";
}
