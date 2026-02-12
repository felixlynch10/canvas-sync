import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderCalendar } from "../src/calendarRenderer";
import { TFile, createMockApp } from "obsidian";
import { CanvasSyncSettings } from "../src/settings";

// Obsidian's TFile.path uses .contains() which is not standard on String
if (!(String.prototype as any).contains) {
	(String.prototype as any).contains = String.prototype.includes;
}

/**
 * Obsidian extends HTMLElement with createDiv/createEl/createSpan/empty/addClass/removeClass.
 * Polyfill these so the renderer can build its DOM tree in jsdom.
 */
function addObsidianDomMethods(el: HTMLElement): HTMLElement {
	(el as any).empty = function () {
		while (this.firstChild) this.removeChild(this.firstChild);
	};
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
	(el as any).addClass = function (...classes: string[]) {
		this.classList.add(...classes);
	};
	(el as any).removeClass = function (...classes: string[]) {
		this.classList.remove(...classes);
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

describe("renderCalendar", () => {
	let el: HTMLElement;
	let settings: CanvasSyncSettings;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-02-12T12:00:00"));

		el = addObsidianDomMethods(document.createElement("div"));
		settings = makeSettings();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	function setupFiles(app: any) {
		const file1 = makeTodoFile("History", "Essay");
		const file2 = makeTodoFile("Math", "Problem Set");
		const file3 = makeTodoFile("History", "Reading");
		const file4 = makeTodoFile("Science", "Lab Report");

		app.vault.getFiles.mockReturnValue([file1, file2, file3, file4]);
		app.metadataCache.getFileCache.mockImplementation((f: TFile) => {
			if (f === file1) return { frontmatter: { due: "2026-02-12" } }; // today
			if (f === file2) return { frontmatter: { due: "2026-02-10" } }; // overdue
			if (f === file3) return { frontmatter: { due: "2026-02-15" } }; // upcoming
			if (f === file4) return { frontmatter: { due: "2026-03-01" } }; // next month
			return null;
		});

		return { file1, file2, file3, file4 };
	}

	function getContainer(): HTMLElement {
		return el.querySelector(".canvas-cal-container") as HTMLElement;
	}

	function getToolbar(): HTMLElement {
		return el.querySelector(".canvas-cal-view-toolbar") as HTMLElement;
	}

	function getButtons(): HTMLButtonElement[] {
		return Array.from(el.querySelectorAll(".canvas-cal-view-btn")) as HTMLButtonElement[];
	}

	function getHeaderLabel(): HTMLElement {
		return el.querySelector(".canvas-cal-month-label") as HTMLElement;
	}

	function getNavButtons(): HTMLButtonElement[] {
		return Array.from(el.querySelectorAll(".canvas-cal-nav")) as HTMLButtonElement[];
	}

	// ---- View toolbar ----

	it("renders container with view toolbar", async () => {
		const app = createMockApp();
		setupFiles(app);
		await renderCalendar(app, settings, el);

		expect(getContainer()).toBeTruthy();
		expect(getToolbar()).toBeTruthy();
		expect(getButtons()).toHaveLength(3);
	});

	it("toolbar shows Day, Week, Month buttons", async () => {
		const app = createMockApp();
		setupFiles(app);
		await renderCalendar(app, settings, el);

		const labels = getButtons().map((b) => b.textContent);
		expect(labels).toEqual(["Day", "Week", "Month"]);
	});

	it("month view is active by default", async () => {
		const app = createMockApp();
		setupFiles(app);
		await renderCalendar(app, settings, el);

		const buttons = getButtons();
		expect(buttons[2].classList.contains("active")).toBe(true); // Month
		expect(buttons[0].classList.contains("active")).toBe(false); // Day
		expect(buttons[1].classList.contains("active")).toBe(false); // Week
	});

	// ---- Month view ----

	it("month view renders grid with day labels", async () => {
		const app = createMockApp();
		setupFiles(app);
		await renderCalendar(app, settings, el);

		const grid = el.querySelector(".canvas-cal-grid");
		expect(grid).toBeTruthy();

		const dayLabels = grid!.querySelectorAll(".canvas-cal-day-label");
		expect(dayLabels).toHaveLength(7);
		expect(dayLabels[0].textContent).toBe("Sun");
		expect(dayLabels[6].textContent).toBe("Sat");
	});

	it("month view shows correct month label", async () => {
		const app = createMockApp();
		setupFiles(app);
		await renderCalendar(app, settings, el);

		expect(getHeaderLabel().textContent).toContain("February");
		expect(getHeaderLabel().textContent).toContain("2026");
	});

	it("month view shows assignment dots", async () => {
		const app = createMockApp();
		setupFiles(app);
		await renderCalendar(app, settings, el);

		const dots = el.querySelectorAll(".canvas-cal-dot");
		expect(dots.length).toBeGreaterThanOrEqual(3); // 3 items in Feb
	});

	it("today has .today class in month view", async () => {
		const app = createMockApp();
		setupFiles(app);
		await renderCalendar(app, settings, el);

		const todayCells = el.querySelectorAll(".canvas-cal-day.today");
		expect(todayCells.length).toBe(1);

		const dayNumber = todayCells[0].querySelector(".canvas-cal-day-number");
		expect(dayNumber).toBeTruthy();
		expect(dayNumber!.textContent).toBe("12");
	});

	// ---- Week view ----

	it("clicking Week button switches to week view", async () => {
		const app = createMockApp();
		setupFiles(app);
		await renderCalendar(app, settings, el);

		const buttons = getButtons();
		buttons[1].click(); // Week

		expect(buttons[1].classList.contains("active")).toBe(true);
		expect(buttons[2].classList.contains("active")).toBe(false); // Month
		expect(el.querySelector(".canvas-cal-week-grid")).toBeTruthy();
		expect(el.querySelector(".canvas-cal-grid")).toBeFalsy();
	});

	it("week view renders 7 day labels and 7 cells", async () => {
		const app = createMockApp();
		setupFiles(app);
		await renderCalendar(app, settings, el);

		getButtons()[1].click(); // Week

		const grid = el.querySelector(".canvas-cal-week-grid")!;
		const dayLabels = grid.querySelectorAll(".canvas-cal-day-label");
		expect(dayLabels).toHaveLength(7);

		const cells = grid.querySelectorAll(".canvas-cal-week-cell");
		expect(cells).toHaveLength(7);
	});

	it("week view shows items with full names", async () => {
		const app = createMockApp();
		setupFiles(app);
		await renderCalendar(app, settings, el);

		getButtons()[1].click(); // Week

		const itemNames = el.querySelectorAll(".canvas-cal-week-item-name");
		const names = Array.from(itemNames).map((n) => n.textContent);
		// Feb 12 is Thursday → week is Sun Feb 8 – Sat Feb 14
		// Essay (Feb 12) and Problem Set (Feb 10) are in this week
		// Reading (Feb 15) is Sunday of next week
		expect(names).toContain("Essay");
		expect(names).toContain("Problem Set");

		// Full names, not truncated (no ellipsis)
		for (const nameEl of Array.from(itemNames)) {
			expect(nameEl.textContent).not.toContain("\u2026");
		}
	});

	it("week view shows subject badges", async () => {
		const app = createMockApp();
		setupFiles(app);
		await renderCalendar(app, settings, el);

		getButtons()[1].click(); // Week

		const subjects = el.querySelectorAll(".canvas-cal-week-item-subject");
		const texts = Array.from(subjects).map((s) => s.textContent);
		expect(texts).toContain("History");
		expect(texts).toContain("Math");
	});

	it("week view header shows date range", async () => {
		const app = createMockApp();
		setupFiles(app);
		await renderCalendar(app, settings, el);

		getButtons()[1].click(); // Week

		const label = getHeaderLabel().textContent!;
		// Feb 12 2026 is a Thursday, so week is Feb 8 – 14
		expect(label).toContain("Feb");
		expect(label).toContain("8");
		expect(label).toContain("14");
		expect(label).toContain("2026");
	});

	it("today has .today class in week view", async () => {
		const app = createMockApp();
		setupFiles(app);
		await renderCalendar(app, settings, el);

		getButtons()[1].click(); // Week

		const todayCells = el.querySelectorAll(".canvas-cal-week-cell.today");
		expect(todayCells.length).toBe(1);

		const dayNumber = todayCells[0].querySelector(".canvas-cal-day-number");
		expect(dayNumber).toBeTruthy();
		expect(dayNumber!.textContent).toBe("12");
	});

	it("week view items are clickable", async () => {
		const app = createMockApp();
		setupFiles(app);
		await renderCalendar(app, settings, el);

		getButtons()[1].click(); // Week

		const firstItem = el.querySelector(".canvas-cal-week-item-name") as HTMLElement;
		expect(firstItem).toBeTruthy();
		firstItem.click();
		expect(app.workspace.openLinkText).toHaveBeenCalled();
	});

	// ---- Day view ----

	it("clicking Day button switches to day view", async () => {
		const app = createMockApp();
		setupFiles(app);
		await renderCalendar(app, settings, el);

		getButtons()[0].click(); // Day

		expect(getButtons()[0].classList.contains("active")).toBe(true);
		expect(getButtons()[2].classList.contains("active")).toBe(false);
		expect(el.querySelector(".canvas-cal-day-view")).toBeTruthy();
	});

	it("day view shows items for current date", async () => {
		const app = createMockApp();
		const { file1 } = setupFiles(app);
		await renderCalendar(app, settings, el);

		getButtons()[0].click(); // Day — Feb 12

		const items = el.querySelectorAll(".canvas-cal-day-item");
		expect(items.length).toBe(1); // Only Essay due Feb 12

		const name = el.querySelector(".canvas-cal-day-item-name");
		expect(name?.textContent).toBe("Essay");
	});

	it("day view shows subject badge", async () => {
		const app = createMockApp();
		setupFiles(app);
		await renderCalendar(app, settings, el);

		getButtons()[0].click(); // Day

		const subject = el.querySelector(".canvas-cal-day-item-subject");
		expect(subject?.textContent).toBe("History");
	});

	it("day view header shows full date", async () => {
		const app = createMockApp();
		setupFiles(app);
		await renderCalendar(app, settings, el);

		getButtons()[0].click(); // Day

		const label = getHeaderLabel().textContent!;
		expect(label).toContain("Thursday");
		expect(label).toContain("February");
		expect(label).toContain("12");
		expect(label).toContain("2026");
	});

	it("day view shows empty state when no items", async () => {
		const app = createMockApp();
		setupFiles(app);
		await renderCalendar(app, settings, el);

		getButtons()[0].click(); // Day — Feb 12
		// Navigate to Feb 13 (no items)
		getNavButtons()[1].click(); // next

		const empty = el.querySelector(".canvas-cal-day-empty");
		expect(empty).toBeTruthy();
		expect(empty?.textContent).toBe("No assignments due");
	});

	it("day view items are clickable", async () => {
		const app = createMockApp();
		const { file1 } = setupFiles(app);
		await renderCalendar(app, settings, el);

		getButtons()[0].click(); // Day — Feb 12 has Essay (file1)

		const nameEl = el.querySelector(".canvas-cal-day-item-name") as HTMLElement;
		expect(nameEl).toBeTruthy();
		nameEl.click();
		expect(app.workspace.openLinkText).toHaveBeenCalledWith(file1.path, "");
	});

	// ---- Navigation ----

	it("next button advances by month in month view", async () => {
		const app = createMockApp();
		setupFiles(app);
		await renderCalendar(app, settings, el);

		getNavButtons()[1].click(); // next

		const label = getHeaderLabel().textContent!;
		expect(label).toContain("March");
		expect(label).toContain("2026");
	});

	it("prev button goes back by month in month view", async () => {
		const app = createMockApp();
		setupFiles(app);
		await renderCalendar(app, settings, el);

		getNavButtons()[0].click(); // prev

		const label = getHeaderLabel().textContent!;
		expect(label).toContain("January");
		expect(label).toContain("2026");
	});

	it("next button advances by week in week view", async () => {
		const app = createMockApp();
		setupFiles(app);
		await renderCalendar(app, settings, el);

		getButtons()[1].click(); // Week
		const labelBefore = getHeaderLabel().textContent!;

		getNavButtons()[1].click(); // next week
		const labelAfter = getHeaderLabel().textContent!;

		expect(labelAfter).not.toBe(labelBefore);
		// Feb 8–14 → Feb 15–21
		expect(labelAfter).toContain("15");
		expect(labelAfter).toContain("21");
	});

	it("next button advances by day in day view", async () => {
		const app = createMockApp();
		setupFiles(app);
		await renderCalendar(app, settings, el);

		getButtons()[0].click(); // Day — Feb 12
		getNavButtons()[1].click(); // next — Feb 13

		const label = getHeaderLabel().textContent!;
		expect(label).toContain("February");
		expect(label).toContain("13");
	});

	it("prev button goes back by day in day view", async () => {
		const app = createMockApp();
		setupFiles(app);
		await renderCalendar(app, settings, el);

		getButtons()[0].click(); // Day — Feb 12
		getNavButtons()[0].click(); // prev — Feb 11

		const label = getHeaderLabel().textContent!;
		expect(label).toContain("February");
		expect(label).toContain("11");
	});

	// ---- Empty state ----

	it("month view with no items renders grid without dots", async () => {
		const app = createMockApp();
		app.vault.getFiles.mockReturnValue([]);
		await renderCalendar(app, settings, el);

		const grid = el.querySelector(".canvas-cal-grid");
		expect(grid).toBeTruthy();
		const dots = el.querySelectorAll(".canvas-cal-dot");
		expect(dots.length).toBe(0);
	});
});
