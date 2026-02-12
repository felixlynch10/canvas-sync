import { App, TFile, Notice } from "obsidian";
import { CanvasSyncSettings } from "./settings";
import { getUrgency, formatDateShort } from "./utils";

interface TodoItem {
	file: TFile;
	name: string;
	due: string | null;
	subject: string;
	urgency: ReturnType<typeof getUrgency>;
}

const SECTION_LABELS: Record<string, string> = {
	overdue: "Overdue",
	today: "Due Today",
	tomorrow: "Due Tomorrow",
	week: "This Week",
	later: "Later",
	none: "No Due Date",
};

const SECTION_ORDER = ["overdue", "today", "tomorrow", "week", "later", "none"];

type SortMode = "date" | "subject" | "name";

function collectItems(app: App, settings: CanvasSyncSettings): TodoItem[] {
	const allFiles = app.vault.getFiles();
	const todoFiles = allFiles.filter(
		(f) =>
			f.path.startsWith(settings.semesterBasePath) &&
			f.path.contains("/Todo/") &&
			f.extension === "md"
	);

	const items: TodoItem[] = [];
	for (const file of todoFiles) {
		const cache = app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter;
		const due = fm?.due ?? null;
		const pathParts = file.path.split("/");
		const todoIdx = pathParts.indexOf("Todo");
		const subject = todoIdx > 0 ? pathParts[todoIdx - 1] : "Unknown";

		items.push({
			file,
			name: file.basename,
			due,
			subject,
			urgency: getUrgency(due),
		});
	}

	items.sort((a, b) => {
		if (!a.due && !b.due) return 0;
		if (!a.due) return 1;
		if (!b.due) return -1;
		return a.due.localeCompare(b.due);
	});

	return items;
}

function renderItems(app: App, container: HTMLElement, items: TodoItem[], sortMode: SortMode): void {
	container.empty();

	if (items.length === 0) {
		container.createDiv({ cls: "canvas-todo-empty", text: "No pending assignments" });
		return;
	}

	if (sortMode === "date") {
		const grouped: Record<string, TodoItem[]> = {};
		for (const item of items) {
			const key = item.urgency;
			if (!grouped[key]) grouped[key] = [];
			grouped[key].push(item);
		}

		for (const key of SECTION_ORDER) {
			const sectionItems = grouped[key];
			if (!sectionItems || sectionItems.length === 0) continue;

			const section = container.createDiv({ cls: "canvas-todo-section" });
			section.createDiv({
				cls: `canvas-todo-section-header canvas-todo-${key === "none" ? "nodate" : key}`,
				text: SECTION_LABELS[key],
			});

			for (const item of sectionItems) {
				renderItem(app, section, item);
			}
		}
	} else if (sortMode === "subject") {
		const grouped: Record<string, TodoItem[]> = {};
		for (const item of items) {
			if (!grouped[item.subject]) grouped[item.subject] = [];
			grouped[item.subject].push(item);
		}

		const subjects = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

		for (const subject of subjects) {
			const section = container.createDiv({ cls: "canvas-todo-section" });
			section.createDiv({
				cls: "canvas-todo-section-header canvas-todo-subject-group",
				text: subject,
			});

			for (const item of grouped[subject]) {
				renderItem(app, section, item);
			}
		}
	} else {
		const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
		for (const item of sorted) {
			renderItem(app, container, item);
		}
	}
}

export async function renderTodoList(
	app: App,
	settings: CanvasSyncSettings,
	el: HTMLElement
): Promise<void> {
	const container = el.createDiv({ cls: "canvas-todo-container" });

	const items = collectItems(app, settings);

	// Build toolbar
	const toolbar = container.createDiv({ cls: "canvas-todo-toolbar" });
	const itemsArea = container.createDiv({ cls: "canvas-todo-items" });

	let currentSort: SortMode = "date";

	const buttons: Record<SortMode, HTMLButtonElement> = {} as Record<SortMode, HTMLButtonElement>;
	const modes: { mode: SortMode; label: string }[] = [
		{ mode: "date", label: "Date" },
		{ mode: "subject", label: "Subject" },
		{ mode: "name", label: "Name" },
	];

	for (const { mode, label } of modes) {
		const btn = toolbar.createEl("button", {
			cls: `canvas-todo-sort-btn${mode === currentSort ? " active" : ""}`,
			text: label,
		});
		btn.addEventListener("click", () => {
			if (currentSort === mode) return;
			currentSort = mode;
			for (const m of Object.keys(buttons) as SortMode[]) {
				buttons[m].removeClass("active");
			}
			btn.addClass("active");
			renderItems(app, itemsArea, items, currentSort);
		});
		buttons[mode] = btn;
	}

	renderItems(app, itemsArea, items, currentSort);
}

function renderItem(app: App, parent: HTMLElement, item: TodoItem): void {
	const row = parent.createDiv({ cls: "canvas-todo-item" });

	const checkbox = row.createEl("input", { cls: "canvas-todo-checkbox" });
	checkbox.type = "checkbox";
	checkbox.addEventListener("click", () => completeItem(app, item, row));

	const info = row.createDiv({ cls: "canvas-todo-info" });

	const nameEl = info.createSpan({ cls: "canvas-todo-name", text: item.name });
	nameEl.addEventListener("click", () => {
		app.workspace.openLinkText(item.file.path, "");
	});

	const meta = info.createDiv({ cls: "canvas-todo-meta" });
	meta.createSpan({ cls: "canvas-todo-subject", text: item.subject });
	if (item.due) {
		const dueCls = item.urgency === "overdue"
			? "canvas-todo-due canvas-todo-date-overdue"
			: "canvas-todo-due";
		meta.createSpan({ cls: dueCls, text: formatDateShort(item.due) });
	}
}

async function completeItem(app: App, item: TodoItem, rowEl: HTMLElement): Promise<void> {
	const file = item.file;
	let content = await app.vault.read(file);

	// Update frontmatter: remove Status/Todo tag, change status to Done
	content = content.replace(/^(tags:\s*\n)([\s\S]*?)(?=\n\w|\n---)/m, (_match, prefix, tagBlock) => {
		const lines: string[] = tagBlock.split("\n");
		const filtered = lines.filter((l: string) => !l.trim().match(/^-?\s*Status\/Todo$/));
		return prefix + filtered.join("\n");
	});
	content = content.replace(/^status:\s*Todo$/m, "status: Done");

	await app.vault.modify(file, content);

	// Move file from Todo/ to Done/
	const newPath = file.path.replace("/Todo/", "/Done/");
	const doneFolder = newPath.substring(0, newPath.lastIndexOf("/"));

	try {
		await app.vault.createFolder(doneFolder);
	} catch {
		// folder already exists
	}

	await app.fileManager.renameFile(file, newPath);
	new Notice("Moved to Done: " + file.basename);

	rowEl.remove();
}
