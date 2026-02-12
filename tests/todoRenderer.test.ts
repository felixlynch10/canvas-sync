import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderTodoList } from "../src/todoRenderer";
import { TFile, Notice, createMockApp } from "obsidian";
import { CanvasSyncSettings } from "../src/settings";

// Obsidian's TFile.path uses .contains() which is not standard on String
if (!(String.prototype as any).contains) {
	(String.prototype as any).contains = String.prototype.includes;
}

/**
 * Obsidian extends HTMLElement with createDiv/createEl/createSpan helpers.
 * Polyfill these so the renderer can build its DOM tree in jsdom.
 */
function addObsidianDomMethods(el: HTMLElement): HTMLElement {
	(el as any).createDiv = function (opts?: any) {
		const div = document.createElement("div");
		if (opts?.cls) div.className = opts.cls;
		if (opts?.text) div.textContent = opts.text;
		addObsidianDomMethods(div);
		this.appendChild(div);
		return div;
	};
	(el as any).createEl = function (tag: string, opts?: any) {
		const child = document.createElement(tag);
		if (opts?.cls) child.className = opts.cls;
		if (opts?.text) child.textContent = opts.text;
		addObsidianDomMethods(child);
		this.appendChild(child);
		return child;
	};
	(el as any).createSpan = function (opts?: any) {
		return (this as any).createEl("span", opts);
	};
	return el;
}

const BASE = "2025-2026 - Sophmore/01 - Spring Semester";

function makeSettings(): CanvasSyncSettings {
	return {
		canvasBaseUrl: "https://school.instructure.com",
		apiToken: "token",
		semesterBasePath: BASE,
		courseMappings: {},
		autoSyncOnStartup: false,
		syncIntervalMinutes: 0,
	};
}

function makeTodoFile(subject: string, filename: string): TFile {
	return new TFile(`${BASE}/${subject}/Todo/${filename}.md`);
}

describe("renderTodoList", () => {
	let el: HTMLElement;
	let settings: CanvasSyncSettings;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-02-12"));

		el = addObsidianDomMethods(document.createElement("div"));
		settings = makeSettings();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	// ---------- Empty state ----------

	describe("empty state", () => {
		it("renders 'No pending assignments' when there are no todo files", async () => {
			const app = createMockApp();
			app.vault.getFiles.mockReturnValue([]);

			await renderTodoList(app, settings, el);

			const container = el.querySelector(".canvas-todo-container");
			expect(container).not.toBeNull();
			const empty = container!.querySelector(".canvas-todo-empty");
			expect(empty).not.toBeNull();
			expect(empty!.textContent).toBe("No pending assignments");
		});

		it("renders empty state when files exist but none match Todo filter", async () => {
			const app = createMockApp();
			app.vault.getFiles.mockReturnValue([
				new TFile(`${BASE}/History/Done/old.md`),
				new TFile("Other/Todo/task.md"),
			]);

			await renderTodoList(app, settings, el);

			const empty = el.querySelector(".canvas-todo-empty");
			expect(empty).not.toBeNull();
			expect(empty!.textContent).toBe("No pending assignments");
		});
	});

	// ---------- Renders items grouped by urgency ----------

	describe("renders todo items grouped by urgency", () => {
		it("groups overdue, today, and later items into correct sections", async () => {
			const overdueFile = makeTodoFile("History", "Essay");
			const todayFile = makeTodoFile("Math", "Homework");
			const laterFile = makeTodoFile("Science", "Lab Report");

			const app = createMockApp();
			app.vault.getFiles.mockReturnValue([overdueFile, todayFile, laterFile]);
			app.metadataCache.getFileCache.mockImplementation((f: TFile) => {
				if (f === overdueFile) return { frontmatter: { due: "2026-02-10" } };
				if (f === todayFile) return { frontmatter: { due: "2026-02-12" } };
				if (f === laterFile) return { frontmatter: { due: "2026-02-20" } };
				return null;
			});

			await renderTodoList(app, settings, el);

			const container = el.querySelector(".canvas-todo-container")!;

			// Should not show empty state
			expect(container.querySelector(".canvas-todo-empty")).toBeNull();

			// Verify section headers exist with correct classes
			const overdueHeader = container.querySelector(".canvas-todo-overdue");
			expect(overdueHeader).not.toBeNull();
			expect(overdueHeader!.textContent).toBe("Overdue");

			const todayHeader = container.querySelector(".canvas-todo-today");
			expect(todayHeader).not.toBeNull();
			expect(todayHeader!.textContent).toBe("Due Today");

			const laterHeader = container.querySelector(".canvas-todo-later");
			expect(laterHeader).not.toBeNull();
			expect(laterHeader!.textContent).toBe("Later");

			// Verify no tomorrow/week/nodate sections since we have none of those
			expect(container.querySelector(".canvas-todo-tomorrow")).toBeNull();
			expect(container.querySelector(".canvas-todo-week")).toBeNull();
			expect(container.querySelector(".canvas-todo-nodate")).toBeNull();

			// Verify items have checkbox, name, subject badge, due date
			const items = container.querySelectorAll(".canvas-todo-item");
			expect(items.length).toBe(3);

			// Each item should have a checkbox input
			items.forEach((item) => {
				expect(item.querySelector(".canvas-todo-checkbox")).not.toBeNull();
				expect(item.querySelector(".canvas-todo-name")).not.toBeNull();
				expect(item.querySelector(".canvas-todo-subject")).not.toBeNull();
				expect(item.querySelector(".canvas-todo-due")).not.toBeNull();
			});
		});

		it("renders sections in the correct order", async () => {
			const overdueFile = makeTodoFile("History", "Essay");
			const tomorrowFile = makeTodoFile("Math", "Homework");
			const weekFile = makeTodoFile("Science", "Lab");
			const laterFile = makeTodoFile("English", "Paper");

			const app = createMockApp();
			app.vault.getFiles.mockReturnValue([laterFile, overdueFile, weekFile, tomorrowFile]);
			app.metadataCache.getFileCache.mockImplementation((f: TFile) => {
				if (f === overdueFile) return { frontmatter: { due: "2026-02-10" } };
				if (f === tomorrowFile) return { frontmatter: { due: "2026-02-13" } };
				if (f === weekFile) return { frontmatter: { due: "2026-02-16" } };
				if (f === laterFile) return { frontmatter: { due: "2026-03-01" } };
				return null;
			});

			await renderTodoList(app, settings, el);

			const headers = el.querySelectorAll(".canvas-todo-section-header");
			const labels = Array.from(headers).map((h) => h.textContent);
			expect(labels).toEqual(["Overdue", "Due Tomorrow", "This Week", "Later"]);
		});
	});

	// ---------- Items without due dates ----------

	describe("items without due dates", () => {
		it("groups items with no due date in 'No Due Date' section", async () => {
			const noDueFile = makeTodoFile("Art", "Sketch");
			const dueFile = makeTodoFile("Math", "Homework");

			const app = createMockApp();
			app.vault.getFiles.mockReturnValue([noDueFile, dueFile]);
			app.metadataCache.getFileCache.mockImplementation((f: TFile) => {
				if (f === dueFile) return { frontmatter: { due: "2026-02-12" } };
				// noDueFile has no frontmatter
				return null;
			});

			await renderTodoList(app, settings, el);

			const nodateHeader = el.querySelector(".canvas-todo-nodate");
			expect(nodateHeader).not.toBeNull();
			expect(nodateHeader!.textContent).toBe("No Due Date");
		});

		it("places 'No Due Date' section after all dated sections", async () => {
			const noDueFile = makeTodoFile("Art", "Sketch");
			const todayFile = makeTodoFile("Math", "Homework");

			const app = createMockApp();
			app.vault.getFiles.mockReturnValue([noDueFile, todayFile]);
			app.metadataCache.getFileCache.mockImplementation((f: TFile) => {
				if (f === todayFile) return { frontmatter: { due: "2026-02-12" } };
				return null;
			});

			await renderTodoList(app, settings, el);

			const headers = el.querySelectorAll(".canvas-todo-section-header");
			const labels = Array.from(headers).map((h) => h.textContent);
			expect(labels).toEqual(["Due Today", "No Due Date"]);
		});

		it("does not render a due date span for items without due dates", async () => {
			const noDueFile = makeTodoFile("Art", "Sketch");

			const app = createMockApp();
			app.vault.getFiles.mockReturnValue([noDueFile]);
			app.metadataCache.getFileCache.mockReturnValue(null);

			await renderTodoList(app, settings, el);

			const item = el.querySelector(".canvas-todo-item")!;
			expect(item.querySelector(".canvas-todo-due")).toBeNull();
		});
	});

	// ---------- Subject extraction from path ----------

	describe("subject extraction from path", () => {
		it("extracts subject from path segment before /Todo/", async () => {
			const historyFile = makeTodoFile("History", "assignment");
			const mathFile = makeTodoFile("Math", "hw");

			const app = createMockApp();
			app.vault.getFiles.mockReturnValue([historyFile, mathFile]);
			app.metadataCache.getFileCache.mockReturnValue({ frontmatter: { due: "2026-02-15" } });

			await renderTodoList(app, settings, el);

			const subjects = el.querySelectorAll(".canvas-todo-subject");
			const subjectTexts = Array.from(subjects).map((s) => s.textContent);
			expect(subjectTexts).toContain("History");
			expect(subjectTexts).toContain("Math");
		});

		it("displays item name from file basename", async () => {
			const file = makeTodoFile("History", "My Essay");

			const app = createMockApp();
			app.vault.getFiles.mockReturnValue([file]);
			app.metadataCache.getFileCache.mockReturnValue({ frontmatter: { due: "2026-02-15" } });

			await renderTodoList(app, settings, el);

			const nameEl = el.querySelector(".canvas-todo-name");
			expect(nameEl).not.toBeNull();
			expect(nameEl!.textContent).toBe("My Essay");
		});
	});

	// ---------- Filters correctly ----------

	describe("filters correctly", () => {
		it("excludes files not starting with semesterBasePath", async () => {
			const wrongBase = new TFile("Other Path/History/Todo/task.md");
			const correctFile = makeTodoFile("History", "task");

			const app = createMockApp();
			app.vault.getFiles.mockReturnValue([wrongBase, correctFile]);
			app.metadataCache.getFileCache.mockReturnValue({ frontmatter: { due: "2026-02-15" } });

			await renderTodoList(app, settings, el);

			const items = el.querySelectorAll(".canvas-todo-item");
			expect(items.length).toBe(1);
			expect(items[0].querySelector(".canvas-todo-name")!.textContent).toBe("task");
		});

		it("excludes files not in a /Todo/ folder", async () => {
			const doneFile = new TFile(`${BASE}/History/Done/task.md`);
			const rootFile = new TFile(`${BASE}/History/task.md`);
			const todoFile = makeTodoFile("History", "task");

			const app = createMockApp();
			app.vault.getFiles.mockReturnValue([doneFile, rootFile, todoFile]);
			app.metadataCache.getFileCache.mockReturnValue({ frontmatter: { due: "2026-02-15" } });

			await renderTodoList(app, settings, el);

			const items = el.querySelectorAll(".canvas-todo-item");
			expect(items.length).toBe(1);
		});

		it("excludes non-.md files", async () => {
			const pdfFile = new TFile(`${BASE}/History/Todo/notes.pdf`);
			pdfFile.extension = "pdf";
			const mdFile = makeTodoFile("History", "task");

			const app = createMockApp();
			app.vault.getFiles.mockReturnValue([pdfFile, mdFile]);
			app.metadataCache.getFileCache.mockReturnValue({ frontmatter: { due: "2026-02-15" } });

			await renderTodoList(app, settings, el);

			const items = el.querySelectorAll(".canvas-todo-item");
			expect(items.length).toBe(1);
		});
	});

	// ---------- Checkbox click handler ----------

	describe("checkbox click handler", () => {
		const frontmatterContent = [
			"---",
			"tags:",
			"  - Status/Todo",
			"  - Subject/History",
			"status: Todo",
			"due: 2026-02-15",
			"---",
			"",
			"# Assignment",
			"Do the thing.",
		].join("\n");

		it("updates frontmatter and moves file from Todo to Done", async () => {
			const file = makeTodoFile("History", "Essay");

			const app = createMockApp();
			app.vault.getFiles.mockReturnValue([file]);
			app.metadataCache.getFileCache.mockReturnValue({
				frontmatter: { due: "2026-02-15" },
			});
			app.vault.read.mockResolvedValue(frontmatterContent);

			await renderTodoList(app, settings, el);

			const checkbox = el.querySelector(".canvas-todo-checkbox") as HTMLInputElement;
			expect(checkbox).not.toBeNull();

			// Click the checkbox
			checkbox.click();

			// Allow async handlers to resolve
			await vi.waitFor(() => {
				expect(app.vault.modify).toHaveBeenCalled();
			});

			// Verify vault.modify was called with updated content
			const modifiedContent = app.vault.modify.mock.calls[0][1] as string;
			expect(modifiedContent).not.toContain("Status/Todo");
			expect(modifiedContent).toContain("status: Done");
			expect(modifiedContent).toContain("Subject/History");

			// Verify file was moved from /Todo/ to /Done/
			expect(app.fileManager.renameFile).toHaveBeenCalledWith(
				file,
				file.path.replace("/Todo/", "/Done/")
			);

			// Verify Notice was shown
			expect(Notice).toHaveBeenCalledWith("Moved to Done: Essay");
		});

		it("creates the Done folder before moving", async () => {
			const file = makeTodoFile("History", "Essay");

			const app = createMockApp();
			app.vault.getFiles.mockReturnValue([file]);
			app.metadataCache.getFileCache.mockReturnValue({
				frontmatter: { due: "2026-02-15" },
			});
			app.vault.read.mockResolvedValue(frontmatterContent);

			await renderTodoList(app, settings, el);

			const checkbox = el.querySelector(".canvas-todo-checkbox") as HTMLInputElement;
			checkbox.click();

			await vi.waitFor(() => {
				expect(app.vault.createFolder).toHaveBeenCalled();
			});

			const expectedDonePath = `${BASE}/History/Done`;
			expect(app.vault.createFolder).toHaveBeenCalledWith(expectedDonePath);
		});

		it("removes the item row from the DOM after completing", async () => {
			const file = makeTodoFile("History", "Essay");

			const app = createMockApp();
			app.vault.getFiles.mockReturnValue([file]);
			app.metadataCache.getFileCache.mockReturnValue({
				frontmatter: { due: "2026-02-15" },
			});
			app.vault.read.mockResolvedValue(frontmatterContent);

			await renderTodoList(app, settings, el);

			expect(el.querySelectorAll(".canvas-todo-item").length).toBe(1);

			const checkbox = el.querySelector(".canvas-todo-checkbox") as HTMLInputElement;
			checkbox.click();

			await vi.waitFor(() => {
				expect(app.fileManager.renameFile).toHaveBeenCalled();
			});

			expect(el.querySelectorAll(".canvas-todo-item").length).toBe(0);
		});

		it("handles createFolder throwing when folder already exists", async () => {
			const file = makeTodoFile("History", "Essay");

			const app = createMockApp();
			app.vault.getFiles.mockReturnValue([file]);
			app.metadataCache.getFileCache.mockReturnValue({
				frontmatter: { due: "2026-02-15" },
			});
			app.vault.read.mockResolvedValue(frontmatterContent);
			app.vault.createFolder.mockRejectedValue(new Error("Folder already exists"));

			await renderTodoList(app, settings, el);

			const checkbox = el.querySelector(".canvas-todo-checkbox") as HTMLInputElement;
			checkbox.click();

			// Should not throw — the catch block handles existing folders
			await vi.waitFor(() => {
				expect(app.fileManager.renameFile).toHaveBeenCalled();
			});

			expect(Notice).toHaveBeenCalledWith("Moved to Done: Essay");
		});
	});

	// ---------- Name click handler ----------

	describe("name click handler", () => {
		it("opens the file when clicking the name", async () => {
			const file = makeTodoFile("History", "Essay");

			const app = createMockApp();
			app.vault.getFiles.mockReturnValue([file]);
			app.metadataCache.getFileCache.mockReturnValue({
				frontmatter: { due: "2026-02-15" },
			});

			await renderTodoList(app, settings, el);

			const nameEl = el.querySelector(".canvas-todo-name") as HTMLElement;
			expect(nameEl).not.toBeNull();

			nameEl.click();

			expect(app.workspace.openLinkText).toHaveBeenCalledWith(file.path, "");
		});

		it("opens the correct file when multiple items exist", async () => {
			const file1 = makeTodoFile("History", "Essay");
			const file2 = makeTodoFile("Math", "Homework");

			const app = createMockApp();
			app.vault.getFiles.mockReturnValue([file1, file2]);
			app.metadataCache.getFileCache.mockReturnValue({
				frontmatter: { due: "2026-02-15" },
			});

			await renderTodoList(app, settings, el);

			const nameEls = el.querySelectorAll(".canvas-todo-name");
			expect(nameEls.length).toBe(2);

			// Click the second item
			(nameEls[1] as HTMLElement).click();
			expect(app.workspace.openLinkText).toHaveBeenCalledWith(file2.path, "");

			// Click the first item
			(nameEls[0] as HTMLElement).click();
			expect(app.workspace.openLinkText).toHaveBeenCalledWith(file1.path, "");
		});
	});

	// ---------- Sorting ----------

	describe("sorting", () => {
		it("sorts items by due date within a section", async () => {
			const earlyFile = makeTodoFile("History", "Early");
			const lateFile = makeTodoFile("Math", "Late");

			const app = createMockApp();
			// Return in reverse order to test sorting
			app.vault.getFiles.mockReturnValue([lateFile, earlyFile]);
			app.metadataCache.getFileCache.mockImplementation((f: TFile) => {
				if (f === earlyFile) return { frontmatter: { due: "2026-02-20" } };
				if (f === lateFile) return { frontmatter: { due: "2026-02-25" } };
				return null;
			});

			await renderTodoList(app, settings, el);

			const names = el.querySelectorAll(".canvas-todo-name");
			expect(names[0].textContent).toBe("Early");
			expect(names[1].textContent).toBe("Late");
		});

		it("sorts items without due dates after items with due dates", async () => {
			const noDueFile = makeTodoFile("Art", "Sketch");
			const dueFile = makeTodoFile("Math", "Homework");

			const app = createMockApp();
			// Return no-due first to test sorting
			app.vault.getFiles.mockReturnValue([noDueFile, dueFile]);
			app.metadataCache.getFileCache.mockImplementation((f: TFile) => {
				if (f === dueFile) return { frontmatter: { due: "2026-02-12" } };
				return null;
			});

			await renderTodoList(app, settings, el);

			// "Due Today" section should come before "No Due Date"
			const headers = el.querySelectorAll(".canvas-todo-section-header");
			const labels = Array.from(headers).map((h) => h.textContent);
			expect(labels.indexOf("Due Today")).toBeLessThan(labels.indexOf("No Due Date"));
		});
	});
});
