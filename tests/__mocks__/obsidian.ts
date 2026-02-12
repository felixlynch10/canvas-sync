import { vi } from "vitest";

// --- Notice ---
export const Notice = vi.fn();

// --- requestUrl ---
export const requestUrl = vi.fn();

// --- TFile ---
export class TFile {
	path: string;
	basename: string;
	extension: string = "md";
	name: string;

	constructor(path: string) {
		this.path = path;
		this.name = path.split("/").pop() || "";
		this.basename = this.name.replace(/\.[^.]+$/, "");
	}
}

// --- TFolder ---
export class TFolder {
	path: string;
	constructor(path: string) {
		this.path = path;
	}
}

// --- Plugin ---
export class Plugin {
	app: any;
	manifest: any = {};

	loadData = vi.fn().mockResolvedValue({});
	saveData = vi.fn().mockResolvedValue(undefined);
	addCommand = vi.fn();
	addSettingTab = vi.fn();
	registerMarkdownCodeBlockProcessor = vi.fn();
	registerInterval = vi.fn();
}

// --- PluginSettingTab ---
export class PluginSettingTab {
	app: any;
	plugin: any;
	containerEl: any = {
		empty: vi.fn(),
		createEl: vi.fn().mockReturnValue(document.createElement("div")),
	};

	constructor(app: any, plugin: any) {
		this.app = app;
		this.plugin = plugin;
	}
}

// --- Setting ---
export class Setting {
	settingEl: HTMLElement;

	constructor(_containerEl: HTMLElement) {
		this.settingEl = document.createElement("div");
	}

	setName(_name: string) { return this; }
	setDesc(_desc: string) { return this; }
	addText(cb: (text: any) => any) {
		const text = {
			setPlaceholder: vi.fn().mockReturnThis(),
			setValue: vi.fn().mockReturnThis(),
			onChange: vi.fn().mockReturnThis(),
			inputEl: document.createElement("input"),
		};
		cb(text);
		return this;
	}
	addToggle(cb: (toggle: any) => any) {
		const toggle = {
			setValue: vi.fn().mockReturnThis(),
			onChange: vi.fn().mockReturnThis(),
		};
		cb(toggle);
		return this;
	}
	addButton(cb: (button: any) => any) {
		const button = {
			setButtonText: vi.fn().mockReturnThis(),
			setWarning: vi.fn().mockReturnThis(),
			onClick: vi.fn().mockReturnThis(),
		};
		cb(button);
		return this;
	}
}

// --- Helper: create a mock App ---
export function createMockApp(overrides: any = {}): any {
	return {
		vault: {
			getFiles: vi.fn().mockReturnValue([]),
			getAbstractFileByPath: vi.fn().mockReturnValue(null),
			create: vi.fn().mockResolvedValue(undefined),
			read: vi.fn().mockResolvedValue(""),
			modify: vi.fn().mockResolvedValue(undefined),
			createFolder: vi.fn().mockResolvedValue(undefined),
			rename: vi.fn().mockResolvedValue(undefined),
			...overrides.vault,
		},
		metadataCache: {
			getFileCache: vi.fn().mockReturnValue(null),
			...overrides.metadataCache,
		},
		workspace: {
			openLinkText: vi.fn().mockResolvedValue(undefined),
			...overrides.workspace,
		},
		fileManager: {
			renameFile: vi.fn().mockResolvedValue(undefined),
			...overrides.fileManager,
		},
		...overrides,
	};
}
