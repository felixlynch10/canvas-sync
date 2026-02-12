import { App, TFile } from "obsidian";
import { CanvasSyncSettings } from "./settings";

interface CalendarItem {
	file: TFile;
	name: string;
	due: string;
	subject: string;
}

type ViewMode = "month" | "week" | "day";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* ── Subject color palette (10 hues) ── */

interface SubjectColor {
	bg: string;
	text: string;
	border: string;
}

const SUBJECT_PALETTE: SubjectColor[] = [
	{ bg: "rgba(230, 77, 77, 0.15)", text: "#c0392b", border: "#c0392b" },   // red
	{ bg: "rgba(230, 126, 34, 0.15)", text: "#d35400", border: "#d35400" },   // orange
	{ bg: "rgba(241, 196, 15, 0.15)", text: "#b7950b", border: "#f1c40f" },   // yellow
	{ bg: "rgba(39, 174, 96, 0.15)", text: "#1e8449", border: "#27ae60" },    // green
	{ bg: "rgba(22, 160, 133, 0.15)", text: "#117a65", border: "#16a085" },   // teal
	{ bg: "rgba(41, 128, 185, 0.15)", text: "#1a5276", border: "#2980b9" },   // blue
	{ bg: "rgba(142, 68, 173, 0.15)", text: "#6c3483", border: "#8e44ad" },   // purple
	{ bg: "rgba(231, 76, 160, 0.15)", text: "#c2185b", border: "#e74ca0" },   // pink
	{ bg: "rgba(52, 73, 94, 0.15)", text: "#2c3e50", border: "#34495e" },     // slate
	{ bg: "rgba(127, 140, 141, 0.15)", text: "#566573", border: "#7f8c8d" },  // grey
];

function hashSubject(subject: string): number {
	let h = 0;
	for (let i = 0; i < subject.length; i++) {
		h = ((h << 5) - h + subject.charCodeAt(i)) | 0;
	}
	return Math.abs(h) % SUBJECT_PALETTE.length;
}

function subjectColor(subject: string): SubjectColor {
	return SUBJECT_PALETTE[hashSubject(subject)];
}

/* ── Date utilities ── */

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

/* ── Data collection ── */

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

/* ── Inline-style helpers ── */

function applyPillStyle(el: HTMLElement, color: SubjectColor): void {
	el.style.background = color.bg;
	el.style.color = color.text;
	el.style.borderLeft = `3px solid ${color.border}`;
}

function applyBarStyle(el: HTMLElement, color: SubjectColor): void {
	el.style.background = color.bg;
	el.style.color = color.text;
	el.style.borderLeft = `4px solid ${color.border}`;
}

/* ── Today-circle helper ── */

function renderDayNumber(
	parent: HTMLElement,
	day: number,
	isToday: boolean,
	cls: string = "canvas-cal-day-number"
): HTMLElement {
	const numEl = parent.createDiv({ cls, text: String(day) });
	if (isToday) {
		numEl.addClass("canvas-cal-today-circle");
	}
	return numEl;
}

/* ── Month view ── */

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
	if (items.length > 0) classes.push("has-items");

	const cell = grid.createDiv({ cls: classes.join(" ") });
	const isToday = dateKey === todayKey;
	renderDayNumber(cell, day, isToday);

	const MAX_VISIBLE = 2;
	const visible = items.slice(0, MAX_VISIBLE);
	const overflow = items.length - MAX_VISIBLE;

	for (const item of visible) {
		const color = subjectColor(item.subject);
		const pill = cell.createDiv({ cls: "canvas-cal-pill", text: item.name });
		applyPillStyle(pill, color);
		pill.addEventListener("click", (e) => {
			e.stopPropagation();
			app.workspace.openLinkText(item.file.path, "");
		});
	}

	if (overflow > 0) {
		cell.createDiv({ cls: "canvas-cal-pill-overflow", text: `+${overflow} more` });
	}
}

/* ── Week view ── */

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

	// Format header
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

	// Day header row (weekday + date number)
	for (let i = 0; i < 7; i++) {
		const cellDate = new Date(sunday);
		cellDate.setDate(sunday.getDate() + i);
		const key = dateKeyFromDate(cellDate);
		const isToday = key === todayKey;

		const headerCell = grid.createDiv({ cls: "canvas-cal-week-header" });
		headerCell.createSpan({ cls: "canvas-cal-week-day-label", text: DAY_LABELS[i] });
		renderDayNumber(headerCell, cellDate.getDate(), isToday, "canvas-cal-week-day-num");
	}

	// One row of 7 tall cells
	for (let i = 0; i < 7; i++) {
		const cellDate = new Date(sunday);
		cellDate.setDate(sunday.getDate() + i);
		const key = dateKeyFromDate(cellDate);

		const cell = grid.createDiv({ cls: "canvas-cal-week-cell" });

		const items = itemsByDate.get(key) || [];
		for (const item of items) {
			const color = subjectColor(item.subject);
			const itemEl = cell.createDiv({ cls: "canvas-cal-week-pill" });
			applyPillStyle(itemEl, color);

			const nameEl = itemEl.createSpan({ cls: "canvas-cal-week-pill-name", text: item.name });
			nameEl.addEventListener("click", (e) => {
				e.stopPropagation();
				app.workspace.openLinkText(item.file.path, "");
			});
			itemEl.createSpan({ cls: "canvas-cal-week-pill-subject", text: item.subject });
		}
	}
}

/* ── Day view ── */

function renderDay(
	contentArea: HTMLElement,
	label: HTMLElement,
	app: App,
	itemsByDate: Map<string, CalendarItem[]>,
	anchorDate: Date
): void {
	contentArea.empty();

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
		const color = subjectColor(item.subject);
		const row = dayView.createDiv({ cls: "canvas-cal-day-pill" });
		applyBarStyle(row, color);

		const nameEl = row.createSpan({ cls: "canvas-cal-day-pill-name", text: item.name });
		nameEl.addEventListener("click", () => {
			app.workspace.openLinkText(item.file.path, "");
		});
		row.createSpan({ cls: "canvas-cal-day-pill-subject", text: item.subject });
	}
}

/* ── Main render entry point ── */

export async function renderCalendar(
	app: App,
	settings: CanvasSyncSettings,
	el: HTMLElement
): Promise<void> {
	const container = el.createDiv({ cls: "canvas-cal-container" });
	const itemsByDate = collectItems(app, settings);

	let currentDate = new Date();
	let currentView: ViewMode = "month";

	// Header: [← →]  label  [Today]
	const header = container.createDiv({ cls: "canvas-cal-header" });

	const navGroup = header.createDiv({ cls: "canvas-cal-nav-group" });
	const prevBtn = navGroup.createEl("button", { cls: "canvas-cal-nav", text: "\u2190" });
	const nextBtn = navGroup.createEl("button", { cls: "canvas-cal-nav", text: "\u2192" });

	const headerLabel = header.createEl("span", { cls: "canvas-cal-month-label" });

	const todayBtn = header.createEl("button", { cls: "canvas-cal-today-btn", text: "Today" });
	todayBtn.addEventListener("click", () => {
		currentDate = new Date();
		refresh();
	});

	// View mode toolbar
	const toolbar = container.createDiv({ cls: "canvas-cal-view-toolbar" });

	const buttons: Record<ViewMode, HTMLButtonElement> = {} as Record<ViewMode, HTMLButtonElement>;
	const modes: { mode: ViewMode; label: string }[] = [
		{ mode: "day", label: "Day" },
		{ mode: "week", label: "Week" },
		{ mode: "month", label: "Month" },
	];

	for (const { mode, label: modeLabel } of modes) {
		const btn = toolbar.createEl("button", {
			cls: `canvas-cal-view-btn${mode === currentView ? " active" : ""}`,
			text: modeLabel,
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
