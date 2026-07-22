/**
 * Custom Model Selection
 *
 * Shows how to select a specific model and thinking level.
 */

import { createAgentSession, ModelRuntime } from "@enterprise-agent/coding-agent";

const modelRuntime = await ModelRuntime.create();

// Find a model configured behind LiteLLM.
const customModel = modelRuntime.getModel("litellm", "deepseek-v4-pro");
if (customModel) {
	console.log(`Found custom model: ${customModel.provider}/${customModel.id}`);
}

// Pick from models with valid gateway authentication.
const available = await modelRuntime.getAvailable();
console.log(
	"Available models:",
	available.map((m) => `${m.provider}/${m.id}`),
);

if (available.length > 0) {
	const { session } = await createAgentSession({
		model: available[0],
		thinkingLevel: "medium", // off, low, medium, high
		modelRuntime,
	});

	try {
		session.subscribe((event) => {
			if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
				process.stdout.write(event.assistantMessageEvent.delta);
			}
		});

		await session.prompt("Say hello in one sentence.");
		console.log();
	} finally {
		session.dispose();
	}
}
