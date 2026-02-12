import { App, TFile } from "obsidian";
import { CanvasSyncSettings } from "./settings";
import { getUrgency } from "./utils";

interface CalendarItem {
	file: TFile;
	name: string;
	due: string;
	subject: string;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getDaysInMonth(year: number, month: number): number {
	return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
	return new Date(year, month, 1).getDay();
}

function buildDateKey(year: number, month: number, day: number): string {
	const m = String(month + 1).padStart(2, "0");
	const d = String(day).padStart(2, "0");
	return `${year}-${m}-${d}`;
}

function collectItems(
	app: App,
	settings: CanvasSyncSettings
): Map<string, CalendarItem[]> {
	const itemsByDate = new Map<string, CalendarItem[]>();
	const allFiles = app.vault.getFiles();
	const todoFiles = allFiles.filter(
		(f) =>
			f.path.startsWith(settings.semesterBasePath) &&
			f.path.contains("/Todo/") &&
			f.extension === "md"
	);

	for (const file of todoFiles) {
		const cache = app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter;
		const due = fm?.due ?? null;
		if (!due) continue;

		const pathParts = file.path.split("/");
		const todoIdx = pathParts.indexOf("Todo");
		const subject = todoIdx > 0 ? pathParts[todoIdx - 1] : "Unknown";

		const dateKey = String(due).slice(0, 10);
		const item: CalendarItem = {
			file,
			name: file.basename,
			due: dateKey,
			subject,
		};

		if (!itemsByDate.has(dateKey)) {
			itemsByDate.set(dateKey, []);
		}
		itemsByDate.get(dateKey)!.push(item);
	}

	return itemsByDate;
}

function renderMonth(
	grid: HTMLElement,
	label: HTMLElement,
	app: App,
	itemsByDate: Map<string, CalendarItem[]>,
	year: number,
	month: number
): void {
	grid.empty();
	label.textContent = new Date(year, month, 1).toLocaleDateString("en-US", {
		month: "long",
		year: "numeric",
	});

	// Day-of-week labels
	for (const dayLabel of DAY_LABELS) {
		grid.createDiv({ cls: "canvas-cal-day-label", text: dayLabel });
	}

	const now = new Date();
	const todayKey = buildDateKey(now.getFullYear(), now.getMonth(), now.getDate());

	const daysInMonth = getDaysInMonth(year, month);
	const firstDay = getFirstDayOfWeek(year, month);

	// Previous month fill
	const prevMonth = month === 0 ? 11 : month - 1;
	const prevYear = month === 0 ? year - 1 : year;
	const daysInPrev = getDaysInMonth(prevYear, prevMonth);
	for (let i = firstDay - 1; i >= 0; i--) {
		const day = daysInPrev - i;
		const key = buildDateKey(prevYear, prevMonth, day);
		renderDayCell(grid, app, itemsByDate, key, day, todayKey, true);
	}

	// Current month days
	for (let day = 1; day <= daysInMonth; day++) {
		const key = buildDateKey(year, month, day);
		renderDayCell(grid, app, itemsByDate, key, day, todayKey, false);
	}

	// Next month fill
	const totalCells = firstDay + daysInMonth;
	const rows = Math.ceil(totalCells / 7);
	const remaining = rows * 7 - totalCells;
	const nextMonth = month === 11 ? 0 : month + 1;
	const nextYear = month === 11 ? year + 1 : year;
	for (let day = 1; day <= remaining; day++) {
		const key = buildDateKey(nextYear, nextMonth, day);
		renderDayCell(grid, app, itemsByDate, key, day, todayKey, true);
	}
}

function renderDayCell(
	grid: HTMLElement,
	app: App,
	itemsByDate: Map<string, CalendarItem[]>,
	dateKey: string,
	day: number,
	todayKey: string,
	outside: boolean
): void {
	const items = itemsByDate.get(dateKey) || [];
	const classes = ["canvas-cal-day"];
	if (outside) classes.push("outside");
	if (dateKey === todayKey) classes.push("today");
	if (items.length > 0) classes.push("has-items");

	const cell = grid.createDiv({ cls: classes.join(" ") });
	cell.createDiv({ cls: "canvas-cal-day-number", text: String(day) });

	for (const item of items) {
		const urgency = getUrgency(item.due);
		let dotClass = "canvas-cal-dot-upcoming";
		if (urgency === "overdue") dotClass = "canvas-cal-dot-overdue";
		else if (urgency === "today") dotClass = "canvas-cal-dot-today";

		const truncated = item.name.length > 15 ? item.name.slice(0, 15) + "\u2026" : item.name;
		const dot = cell.createDiv({ cls: `canvas-cal-dot ${dotClass}`, text: truncated });
		dot.addEventListener("click", (e) => {
			e.stopPropagation();
			app.workspace.openLinkText(item.file.path, "");
		});
	}
}

export async function renderCalendar(
	app: App,
	settings: CanvasSyncSettings,
	el: HTMLElement
): Promise<void> {
	const container = el.createDiv({ cls: "canvas-cal-container" });
	const itemsByDate = collectItems(app, settings);

	const now = new Date();
	let currentYear = now.getFullYear();
	let currentMonth = now.getMonth();

	// Header
	const header = container.createDiv({ cls: "canvas-cal-header" });

	const prevBtn = header.createEl("button", { cls: "canvas-cal-nav", text: "\u2190" });
	const monthLabel = header.createEl("span", { cls: "canvas-cal-month-label" });
	const nextBtn = header.createEl("button", { cls: "canvas-cal-nav", text: "\u2192" });

	// Grid
	const grid = container.createDiv({ cls: "canvas-cal-grid" });

	const refresh = () => renderMonth(grid, monthLabel, app, itemsByDate, currentYear, currentMonth);

	prevBtn.addEventListener("click", () => {
		currentMonth--;
		if (currentMonth < 0) {
			currentMonth = 11;
			currentYear--;
		}
		refresh();
	});

	nextBtn.addEventListener("click", () => {
		currentMonth++;
		if (currentMonth > 11) {
			currentMonth = 0;
			currentYear++;
		}
		refresh();
	});

	refresh();
}
