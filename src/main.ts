import { Plugin } from "obsidian";
import { CanvasSyncSettings, DEFAULT_SETTINGS, CanvasSyncSettingTab } from "./settings";
import { fetchActiveCourses } from "./canvasApi";
import { syncAssignments, backfillDueDates } from "./assignmentSync";
import { renderTodoList } from "./todoRenderer";
import { renderCalendar } from "./calendarRenderer";

export default class CanvasSyncPlugin extends Plugin {
	settings: CanvasSyncSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();

		this.registerMarkdownCodeBlockProcessor("canvas-todo", (source, el, ctx) => {
			renderTodoList(this.app, this.settings, el);
		});

		this.registerMarkdownCodeBlockProcessor("canvas-calendar", (source, el, ctx) => {
			renderCalendar(this.app, this.settings, el);
		});

		this.addCommand({
			id: "sync-canvas-assignments",
			name: "Sync assignments from Canvas",
			callback: () => syncAssignments(this.app, this.settings),
		});

		this.addCommand({
			id: "backfill-due-dates",
			name: "Backfill due dates from note body to frontmatter",
			callback: () => backfillDueDates(this.app, this.settings),
		});

		this.addCommand({
			id: "insert-todo-block",
			name: "Insert todo list block",
			editorCallback: (editor) => {
				editor.replaceSelection("```canvas-todo\n```\n");
			},
		});

		this.addSettingTab(
			new CanvasSyncSettingTab(this.app, this, () =>
				fetchActiveCourses(this.settings.canvasBaseUrl, this.settings.apiToken)
			)
		);

		if (this.settings.autoSyncOnStartup && this.settings.apiToken) {
			setTimeout(() => syncAssignments(this.app, this.settings), 5000);
		}

		if (this.settings.syncIntervalMinutes > 0) {
			this.registerInterval(
				window.setInterval(
					() => syncAssignments(this.app, this.settings),
					this.settings.syncIntervalMinutes * 60 * 1000
				)
			);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
