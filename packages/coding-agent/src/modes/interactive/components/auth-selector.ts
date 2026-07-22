import type { ApiKeyAuth, AuthCheck } from "@enterprise-agent/ai";
import {
	Container,
	type Focusable,
	fuzzyFilter,
	getKeybindings,
	Input,
	Spacer,
	TruncatedText,
} from "@enterprise-agent/tui";
import { theme } from "../theme/theme.ts";
import { DynamicBorder } from "./dynamic-border.ts";

export type AuthSelectorProvider = {
	id: string;
	name: string;
	authType: "api_key";
	method?: ApiKeyAuth;
	status?: AuthCheck;
};

export function formatAuthSelectorProviderType(_authType: "api_key"): string {
	return "API key";
}

/** Component that renders the LiteLLM API-key selector. */
export class AuthSelectorComponent extends Container implements Focusable {
	private searchInput: Input;
	private _focused = false;
	private listContainer: Container;
	private allProviders: AuthSelectorProvider[];
	private filteredProviders: AuthSelectorProvider[];
	private selectedIndex = 0;
	private onSelectCallback: (providerId: string, authType: "api_key") => void;
	private onCancelCallback: () => void;

	get focused(): boolean {
		return this._focused;
	}
	set focused(value: boolean) {
		this._focused = value;
		this.searchInput.focused = value;
	}

	constructor(
		mode: "login" | "logout",
		providers: AuthSelectorProvider[],
		onSelect: (providerId: string, authType: "api_key") => void,
		onCancel: () => void,
		initialSearchInput?: string,
	) {
		super();
		this.allProviders = providers;
		this.filteredProviders = providers;
		this.onSelectCallback = onSelect;
		this.onCancelCallback = onCancel;

		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));
		const title = mode === "login" ? "Configure LiteLLM API key:" : "Remove LiteLLM API key:";
		this.addChild(new TruncatedText(theme.fg("accent", theme.bold(title)), 1, 0));
		this.addChild(new Spacer(1));

		this.searchInput = new Input();
		if (initialSearchInput) this.searchInput.setValue(initialSearchInput);
		this.searchInput.onSubmit = () => {
			const selectedProvider = this.filteredProviders[this.selectedIndex];
			if (selectedProvider) this.onSelectCallback(selectedProvider.id, "api_key");
		};
		this.addChild(this.searchInput);
		this.addChild(new Spacer(1));
		this.listContainer = new Container();
		this.addChild(this.listContainer);
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());
		this.filterProviders(initialSearchInput ?? "");
	}

	private filterProviders(query: string): void {
		this.filteredProviders = query
			? fuzzyFilter(
					this.allProviders,
					query,
					(provider) => `${provider.name} ${provider.id} ${provider.method?.name ?? ""}`,
				)
			: this.allProviders;
		this.selectedIndex = Math.max(0, Math.min(this.selectedIndex, Math.max(0, this.filteredProviders.length - 1)));
		this.updateList();
	}

	private updateList(): void {
		this.listContainer.clear();
		const maxVisible = 8;
		const startIndex = Math.max(
			0,
			Math.min(this.selectedIndex - Math.floor(maxVisible / 2), this.filteredProviders.length - maxVisible),
		);
		const endIndex = Math.min(startIndex + maxVisible, this.filteredProviders.length);
		for (let i = startIndex; i < endIndex; i++) {
			const provider = this.filteredProviders[i];
			if (!provider) continue;
			const selected = i === this.selectedIndex;
			const prefix = selected ? theme.fg("accent", "> ") : "  ";
			const name = theme.fg(selected ? "accent" : "text", provider.name);
			this.listContainer.addChild(new TruncatedText(prefix + name + this.formatStatus(provider.status), 1, 0));
		}
		if (startIndex > 0 || endIndex < this.filteredProviders.length) {
			this.listContainer.addChild(
				new TruncatedText(
					theme.fg("muted", `  (${this.selectedIndex + 1}/${this.filteredProviders.length})`),
					1,
					0,
				),
			);
		}
		if (this.filteredProviders.length === 0) {
			const message = this.allProviders.length === 0 ? "LiteLLM is unavailable" : "No matching entry";
			this.listContainer.addChild(new TruncatedText(theme.fg("muted", `  ${message}`), 1, 0));
		}
	}

	private formatStatus(status: AuthCheck | undefined): string {
		if (!status) return theme.fg("muted", " - unconfigured");
		if (!status.source || status.source === "stored credential") return theme.fg("success", " - configured");
		const source = /^[A-Z][A-Z0-9_]*(?:, [A-Z][A-Z0-9_]*)*$/.test(status.source)
			? `env: ${status.source}`
			: status.source;
		return theme.fg("success", ` - ${source}`);
	}

	handleInput(keyData: string): void {
		const kb = getKeybindings();
		if (kb.matches(keyData, "tui.select.up")) {
			if (this.filteredProviders.length === 0) return;
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
			this.updateList();
		} else if (kb.matches(keyData, "tui.select.down")) {
			if (this.filteredProviders.length === 0) return;
			this.selectedIndex = Math.min(this.filteredProviders.length - 1, this.selectedIndex + 1);
			this.updateList();
		} else if (kb.matches(keyData, "tui.select.confirm")) {
			const selectedProvider = this.filteredProviders[this.selectedIndex];
			if (selectedProvider) this.onSelectCallback(selectedProvider.id, "api_key");
		} else if (kb.matches(keyData, "tui.select.cancel")) {
			this.onCancelCallback();
		} else {
			this.searchInput.handleInput(keyData);
			this.filterProviders(this.searchInput.getValue());
		}
	}
}
