import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import CanvasSyncPlugin from "../src/main";
import { DEFAULT_SETTINGS } from "../src/settings";

vi.mock("../src/canvasApi", () => ({
	fetchActiveCourses: vi.fn(),
}));

vi.mock("../src/assignmentSync", () => ({
	syncAssignments: vi.fn(),
}));

vi.mock("../src/todoRenderer", () => ({
	renderTodoList: vi.fn(),
}));

vi.mock("../src/notificationService", () => ({
	checkAndNotify: vi.fn(),
}));

import { syncAssignments } from "../src/assignmentSync";
import { renderTodoList } from "../src/todoRenderer";

let plugin: CanvasSyncPlugin;

beforeEach(() => {
	vi.useFakeTimers();
	plugin = new CanvasSyncPlugin();
	plugin.app = { vault: {}, metadataCache: {}, workspace: {} } as any;
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("onload", () => {
	it("calls loadSettings (which calls loadData)", async () => {
		await plugin.onload();
		expect(plugin.loadData).toHaveBeenCalled();
	});

	it("registers a 'canvas-todo' code block processor", async () => {
		await plugin.onload();
		expect(plugin.registerMarkdownCodeBlockProcessor).toHaveBeenCalledWith(
			"canvas-todo",
			expect.any(Function),
		);
	});

	it("registers 'sync-canvas-assignments' command", async () => {
		await plugin.onload();
		expect(plugin.addCommand).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "sync-canvas-assignments",
				name: "Sync assignments from Canvas",
				callback: expect.any(Function),
			}),
		);
	});

	it("registers 'insert-todo-block' command", async () => {
		await plugin.onload();
		expect(plugin.addCommand).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "insert-todo-block",
				name: "Insert todo list block",
				editorCallback: expect.any(Function),
			}),
		);
	});

	it("adds a setting tab", async () => {
		await plugin.onload();
		expect(plugin.addSettingTab).toHaveBeenCalledTimes(1);
	});
});

describe("loadSettings", () => {
	it("uses DEFAULT_SETTINGS when no saved data exists", async () => {
		(plugin.loadData as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
		await plugin.loadSettings();
		expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
	});

	it("merges saved data over defaults", async () => {
		(plugin.loadData as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			apiToken: "my-token",
			syncIntervalMinutes: 30,
		});
		await plugin.loadSettings();
		expect(plugin.settings).toEqual({
			...DEFAULT_SETTINGS,
			apiToken: "my-token",
			syncIntervalMinutes: 30,
		});
	});
});

describe("saveSettings", () => {
	it("calls saveData with current settings", async () => {
		plugin.settings = { ...DEFAULT_SETTINGS, apiToken: "tok" };
		await plugin.saveSettings();
		expect(plugin.saveData).toHaveBeenCalledWith(plugin.settings);
	});
});

describe("auto-sync on startup", () => {
	it("sets a timeout when autoSyncOnStartup is true and apiToken is set", async () => {
		(plugin.loadData as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			autoSyncOnStartup: true,
			apiToken: "token",
		});

		const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
		await plugin.onload();

		expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5000);
	});

	it("does not set a timeout when autoSyncOnStartup is false", async () => {
		(plugin.loadData as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			autoSyncOnStartup: false,
			apiToken: "token",
		});

		const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
		await plugin.onload();

		const timeoutCalls = setTimeoutSpy.mock.calls.filter(
			([, delay]) => delay === 5000,
		);
		expect(timeoutCalls).toHaveLength(0);
	});

	it("calls syncAssignments after the timeout fires", async () => {
		(plugin.loadData as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			autoSyncOnStartup: true,
			apiToken: "token",
		});

		await plugin.onload();
		vi.advanceTimersByTime(5000);

		expect(syncAssignments).toHaveBeenCalledWith(plugin.app, plugin.settings);
	});
});

describe("periodic sync", () => {
	it("calls registerInterval with setInterval when syncIntervalMinutes > 0", async () => {
		(plugin.loadData as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			syncIntervalMinutes: 10,
		});

		await plugin.onload();

		// 1 for sync interval + 1 for notification interval
		expect(plugin.registerInterval).toHaveBeenCalledTimes(2);
	});

	it("does not call registerInterval for sync when syncIntervalMinutes is 0", async () => {
		(plugin.loadData as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			syncIntervalMinutes: 0,
		});

		await plugin.onload();

		// only the notification interval
		expect(plugin.registerInterval).toHaveBeenCalledTimes(1);
	});

	it("calls syncAssignments on each interval tick", async () => {
		(plugin.loadData as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			syncIntervalMinutes: 5,
		});

		await plugin.onload();
		vi.advanceTimersByTime(5 * 60 * 1000);

		expect(syncAssignments).toHaveBeenCalledWith(plugin.app, plugin.settings);
	});
});

describe("insert-todo-block command", () => {
	it("calls editor.replaceSelection with the correct markdown block", async () => {
		await plugin.onload();

		const insertCall = (plugin.addCommand as ReturnType<typeof vi.fn>).mock.calls.find(
			([cmd]: [any]) => cmd.id === "insert-todo-block",
		);
		expect(insertCall).toBeDefined();

		const editorCallback = insertCall![0].editorCallback;
		const mockEditor = { replaceSelection: vi.fn() };
		editorCallback(mockEditor);

		expect(mockEditor.replaceSelection).toHaveBeenCalledWith("```canvas-todo\n```\n");
	});
});

describe("canvas-todo code block processor", () => {
	it("calls renderTodoList with the correct arguments", async () => {
		await plugin.onload();

		const processorCall = (
			plugin.registerMarkdownCodeBlockProcessor as ReturnType<typeof vi.fn>
		).mock.calls.find(([lang]: [string]) => lang === "canvas-todo");
		expect(processorCall).toBeDefined();

		const handler = processorCall![1];
		const el = document.createElement("div");
		handler("", el, {});

		expect(renderTodoList).toHaveBeenCalledWith(plugin.app, plugin.settings, el);
	});
});
