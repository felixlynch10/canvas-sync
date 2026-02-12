import { App, TFile } from "obsidian";
import { CanvasSyncSettings } from "./settings";
import { getUrgency } from "./utils";

interface CalendarItem {
	file: TFile;
	name: string;
	due: string;
	subject: string;
}

type ViewMode = "month" | "week" | "day";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

function dateKeyFromDate(date: Date): string {
	return buildDateKey(date.getFullYear(), date.getMonth(), date.getDate());
}

function getSundayOfWeek(date: Date): Date {
	const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	d.setDate(d.getDate() - d.getDay());
	return d;
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
	currentDate: Date
): void {
	grid.empty();

	const year = currentDate.getFullYear();
	const month = currentDate.getMonth();

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

function renderWeek(
	contentArea: HTMLElement,
	label: HTMLElement,
	app: App,
	itemsByDate: Map<string, CalendarItem[]>,
	anchorDate: Date
): void {
	contentArea.empty();

	const sunday = getSundayOfWeek(anchorDate);
	const saturday = new Date(sunday);
	saturday.setDate(saturday.getDate() + 6);

	// Format header: "Feb 9 – 15, 2026" or "Dec 29 – Jan 4, 2026" if spanning months
	const sunMonth = MONTH_SHORT[sunday.getMonth()];
	const satMonth = MONTH_SHORT[saturday.getMonth()];
	if (sunday.getMonth() === saturday.getMonth()) {
		label.textContent = `${sunMonth} ${sunday.getDate()} \u2013 ${saturday.getDate()}, ${saturday.getFullYear()}`;
	} else {
		label.textContent = `${sunMonth} ${sunday.getDate()} \u2013 ${satMonth} ${saturday.getDate()}, ${saturday.getFullYear()}`;
	}

	const now = new Date();
	const todayKey = dateKeyFromDate(now);

	const grid = contentArea.createDiv({ cls: "canvas-cal-week-grid" });

	// Day labels row
	for (const dayLabel of DAY_LABELS) {
		grid.createDiv({ cls: "canvas-cal-day-label", text: dayLabel });
	}

	// One row of 7 tall cells
	for (let i = 0; i < 7; i++) {
		const cellDate = new Date(sunday);
		cellDate.setDate(sunday.getDate() + i);
		const key = dateKeyFromDate(cellDate);

		const classes = ["canvas-cal-week-cell"];
		if (key === todayKey) classes.push("today");

		const cell = grid.createDiv({ cls: classes.join(" ") });
		cell.createDiv({ cls: "canvas-cal-day-number", text: String(cellDate.getDate()) });

		const items = itemsByDate.get(key) || [];
		for (const item of items) {
			const urgency = getUrgency(item.due);
			let dotClass = "canvas-cal-dot-upcoming";
			if (urgency === "overdue") dotClass = "canvas-cal-dot-overdue";
			else if (urgency === "today") dotClass = "canvas-cal-dot-today";

			const itemEl = cell.createDiv({ cls: `canvas-cal-week-item ${dotClass}` });
			const nameEl = itemEl.createSpan({ cls: "canvas-cal-week-item-name", text: item.name });
			nameEl.addEventListener("click", (e) => {
				e.stopPropagation();
				app.workspace.openLinkText(item.file.path, "");
			});
			itemEl.createSpan({ cls: "canvas-cal-week-item-subject", text: item.subject });
		}
	}
}

function renderDay(
	contentArea: HTMLElement,
	label: HTMLElement,
	app: App,
	itemsByDate: Map<string, CalendarItem[]>,
	anchorDate: Date
): void {
	contentArea.empty();

	// Format header: "Wednesday, February 12, 2026"
	label.textContent = anchorDate.toLocaleDateString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	});

	const key = dateKeyFromDate(anchorDate);
	const items = itemsByDate.get(key) || [];

	const dayView = contentArea.createDiv({ cls: "canvas-cal-day-view" });

	if (items.length === 0) {
		dayView.createDiv({ cls: "canvas-cal-day-empty", text: "No assignments due" });
		return;
	}

	for (const item of items) {
		const urgency = getUrgency(item.due);
		let dotColor = "canvas-cal-dot-upcoming";
		if (urgency === "overdue") dotColor = "canvas-cal-dot-overdue";
		else if (urgency === "today") dotColor = "canvas-cal-dot-today";

		const row = dayView.createDiv({ cls: "canvas-cal-day-item" });
		row.createDiv({ cls: `canvas-cal-day-item-dot ${dotColor}` });

		const info = row.createDiv({ cls: "canvas-cal-day-item-info" });
		const nameEl = info.createSpan({ cls: "canvas-cal-day-item-name", text: item.name });
		nameEl.addEventListener("click", () => {
			app.workspace.openLinkText(item.file.path, "");
		});
		info.createSpan({ cls: "canvas-cal-day-item-subject", text: item.subject });
	}
}

export async function renderCalendar(
	app: App,
	settings: CanvasSyncSettings,
	el: HTMLElement
): Promise<void> {
	const container = el.createDiv({ cls: "canvas-cal-container" });
	const itemsByDate = collectItems(app, settings);

	let currentDate = new Date();
	let currentView: ViewMode = "month";

	// Header
	const header = container.createDiv({ cls: "canvas-cal-header" });

	const prevBtn = header.createEl("button", { cls: "canvas-cal-nav", text: "\u2190" });
	const headerLabel = header.createEl("span", { cls: "canvas-cal-month-label" });
	const nextBtn = header.createEl("button", { cls: "canvas-cal-nav", text: "\u2192" });

	// View mode toolbar
	const toolbar = container.createDiv({ cls: "canvas-cal-view-toolbar" });

	const buttons: Record<ViewMode, HTMLButtonElement> = {} as Record<ViewMode, HTMLButtonElement>;
	const modes: { mode: ViewMode; label: string }[] = [
		{ mode: "day", label: "Day" },
		{ mode: "week", label: "Week" },
		{ mode: "month", label: "Month" },
	];

	for (const { mode, label } of modes) {
		const btn = toolbar.createEl("button", {
			cls: `canvas-cal-view-btn${mode === currentView ? " active" : ""}`,
			text: label,
		});
		btn.addEventListener("click", () => {
			if (currentView === mode) return;
			currentView = mode;
			for (const m of Object.keys(buttons) as ViewMode[]) {
				buttons[m].removeClass("active");
			}
			btn.addClass("active");
			refresh();
		});
		buttons[mode] = btn;
	}

	// Content area
	const contentArea = container.createDiv({ cls: "canvas-cal-content" });

	const refresh = () => {
		if (currentView === "month") {
			contentArea.empty();
			const grid = contentArea.createDiv({ cls: "canvas-cal-grid" });
			renderMonth(grid, headerLabel, app, itemsByDate, currentDate);
		} else if (currentView === "week") {
			renderWeek(contentArea, headerLabel, app, itemsByDate, currentDate);
		} else {
			renderDay(contentArea, headerLabel, app, itemsByDate, currentDate);
		}
	};

	prevBtn.addEventListener("click", () => {
		if (currentView === "month") {
			currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
		} else if (currentView === "week") {
			currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - 7);
		} else {
			currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - 1);
		}
		refresh();
	});

	nextBtn.addEventListener("click", () => {
		if (currentView === "month") {
			currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
		} else if (currentView === "week") {
			currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 7);
		} else {
			currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 1);
		}
		refresh();
	});

	refresh();
}
