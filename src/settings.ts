import { App, Notice, PluginSettingTab, Setting } from "obsidian";

export interface CourseMappingConfig {
	canvasCourseName: string;
	subject: string;
	subjectTag: string;
}

export interface CanvasSyncSettings {
	canvasBaseUrl: string;
	apiToken: string;
	semesterBasePath: string;
	courseMappings: Record<string, CourseMappingConfig>;
	autoSyncOnStartup: boolean;
	syncIntervalMinutes: number;
}

export const DEFAULT_SETTINGS: CanvasSyncSettings = {
	canvasBaseUrl: "",
	apiToken: "",
	semesterBasePath: "2025-2026 - Sophmore/01 - Spring Semester",
	courseMappings: {},
	autoSyncOnStartup: false,
	syncIntervalMinutes: 0,
};

export class CanvasSyncSettingTab extends PluginSettingTab {
	plugin: any;
	onFetchCourses: () => Promise<Array<{ id: number; name: string }>>;

	constructor(
		app: App,
		plugin: any,
		onFetchCourses: () => Promise<Array<{ id: number; name: string }>>
	) {
		super(app, plugin);
		this.plugin = plugin;
		this.onFetchCourses = onFetchCourses;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		const settings: CanvasSyncSettings = this.plugin.settings;

		// --- Canvas URL ---
		new Setting(containerEl)
			.setName("Canvas URL")
			.setDesc("Base URL of your Canvas instance")
			.addText((text) =>
				text
					.setPlaceholder("https://school.instructure.com")
					.setValue(settings.canvasBaseUrl)
					.onChange(async (value) => {
						settings.canvasBaseUrl = value.trim();
						await this.plugin.saveSettings();
					})
			);

		// --- API Token ---
		new Setting(containerEl)
			.setName("API Token")
			.setDesc("Your Canvas API access token")
			.addText((text) => {
				text.setPlaceholder("Your Canvas API token")
					.setValue(settings.apiToken)
					.onChange(async (value) => {
						settings.apiToken = value.trim();
						await this.plugin.saveSettings();
					});
				text.inputEl.type = "password";
			});

		// --- Semester Base Path ---
		new Setting(containerEl)
			.setName("Semester Base Path")
			.setDesc("Vault folder path for the current semester")
			.addText((text) =>
				text
					.setPlaceholder(
						"2025-2026 - Sophmore/01 - Spring Semester"
					)
					.setValue(settings.semesterBasePath)
					.onChange(async (value) => {
						settings.semesterBasePath = value.trim();
						await this.plugin.saveSettings();
					})
			);

		// --- Fetch Courses Button ---
		new Setting(containerEl)
			.setName("Fetch Courses")
			.setDesc(
				"Retrieve your active courses from Canvas and populate mappings below"
			)
			.addButton((button) =>
				button.setButtonText("Fetch Courses").onClick(async () => {
					try {
						const courses = await this.onFetchCourses();
						for (const course of courses) {
							const courseId = String(course.id);
							if (!settings.courseMappings[courseId]) {
								settings.courseMappings[courseId] = {
									canvasCourseName: course.name,
									subject: "",
									subjectTag: "",
								};
							}
						}
						await this.plugin.saveSettings();
						this.display();
					} catch (err) {
						new Notice(
							"Failed to fetch courses: " + (err instanceof Error ? err.message : String(err))
						);
					}
				})
			);

		// --- Course Mappings ---
		const courseIds = Object.keys(settings.courseMappings);
		if (courseIds.length > 0) {
			containerEl.createEl("h3", { text: "Course Mappings" });

			for (const courseId of courseIds) {
				const mapping = settings.courseMappings[courseId];

				containerEl.createEl("h4", {
					text: mapping.canvasCourseName || "Course " + courseId,
				});

				new Setting(containerEl)
					.setName("Subject folder name")
					.setDesc("Vault folder name for this course")
					.addText((text) =>
						text
							.setPlaceholder("History")
							.setValue(mapping.subject)
							.onChange(async (value) => {
								mapping.subject = value.trim();
								await this.plugin.saveSettings();
							})
					);

				new Setting(containerEl)
					.setName("Subject tag")
					.setDesc("Tag used in note frontmatter")
					.addText((text) =>
						text
							.setPlaceholder("History/WWI")
							.setValue(mapping.subjectTag)
							.onChange(async (value) => {
								mapping.subjectTag = value.trim();
								await this.plugin.saveSettings();
							})
					);

				new Setting(containerEl).addButton((button) =>
					button
						.setButtonText("Remove")
						.setWarning()
						.onClick(async () => {
							delete settings.courseMappings[courseId];
							await this.plugin.saveSettings();
							this.display();
						})
				);
			}
		}

		// --- Auto-sync on Startup ---
		new Setting(containerEl)
			.setName("Auto-sync on startup")
			.setDesc("Automatically sync assignments when Obsidian starts")
			.addToggle((toggle) =>
				toggle
					.setValue(settings.autoSyncOnStartup)
					.onChange(async (value) => {
						settings.autoSyncOnStartup = value;
						await this.plugin.saveSettings();
					})
			);

		// --- Sync Interval ---
		new Setting(containerEl)
			.setName("Sync interval")
			.setDesc("Minutes between automatic syncs (0 = manual only)")
			.addText((text) =>
				text
					.setPlaceholder("0")
					.setValue(String(settings.syncIntervalMinutes))
					.onChange(async (value) => {
						const parsed = parseInt(value, 10);
						settings.syncIntervalMinutes = isNaN(parsed)
							? 0
							: Math.max(0, parsed);
						await this.plugin.saveSettings();
					})
			);
	}
}
