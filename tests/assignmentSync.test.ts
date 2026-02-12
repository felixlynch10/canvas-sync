import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncAssignments } from "../src/assignmentSync";
import { Notice, TFile, createMockApp, requestUrl } from "obsidian";
import { CanvasSyncSettings } from "../src/settings";

const mockNotice = Notice as ReturnType<typeof vi.fn>;
const mockRequestUrl = requestUrl as ReturnType<typeof vi.fn>;

function makeSettings(overrides: Partial<CanvasSyncSettings> & Record<string, any> = {}): CanvasSyncSettings {
	return {
		canvasBaseUrl: "https://school.instructure.com",
		apiToken: "test-token",
		semesterBasePath: "2025-2026 - Sophmore/01 - Spring Semester",
		courseMappings: {
			"101": {
				canvasCourseName: "History 101",
				subject: "History",
				subjectTag: "History/WWI",
			},
		},
		autoSyncOnStartup: false,
		syncIntervalMinutes: 0,
		...overrides,
	};
}

function makeAssignment(overrides: Record<string, any> = {}): any {
	return {
		id: 1001,
		name: "Test Assignment",
		description: "<p>Do this</p>",
		due_at: "2026-02-15T23:59:00Z",
		html_url: "https://school.instructure.com/courses/101/assignments/1001",
		course_id: 101,
		points_possible: 100,
		submission_types: ["online_upload"],
		published: true,
		...overrides,
	};
}

function mockApiResponse(data: unknown, status = 200, headers: Record<string, string> = {}) {
	return { status, text: JSON.stringify(data), headers };
}

beforeEach(() => {
	mockNotice.mockReset();
	mockRequestUrl.mockReset();
});

// ─── Validation ──────────────────────────────────────────────────────────────

describe("validation", () => {
	it("shows Notice when canvasBaseUrl is empty", async () => {
		const app = createMockApp();
		const settings = makeSettings({ canvasBaseUrl: "" });

		await syncAssignments(app, settings);

		expect(mockNotice).toHaveBeenCalledWith(
			"Canvas Sync: Please configure your Canvas URL and API token in settings.",
		);
		expect(mockRequestUrl).not.toHaveBeenCalled();
	});

	it("shows Notice when apiToken is empty", async () => {
		const app = createMockApp();
		const settings = makeSettings({ apiToken: "" });

		await syncAssignments(app, settings);

		expect(mockNotice).toHaveBeenCalledWith(
			"Canvas Sync: Please configure your Canvas URL and API token in settings.",
		);
		expect(mockRequestUrl).not.toHaveBeenCalled();
	});

	it("shows Notice when no course mappings configured", async () => {
		const app = createMockApp();
		const settings = makeSettings({ courseMappings: {} });

		await syncAssignments(app, settings);

		expect(mockNotice).toHaveBeenCalledWith(
			"Canvas Sync: No course mappings configured. Add courses in settings.",
		);
		expect(mockRequestUrl).not.toHaveBeenCalled();
	});

	it("skips course mappings with empty subject", async () => {
		const app = createMockApp();
		const settings = makeSettings({
			courseMappings: {
				"101": {
					canvasCourseName: "History 101",
					subject: "",
					subjectTag: "History/WWI",
				},
			},
		});

		await syncAssignments(app, settings);

		// All mappings are filtered out so we get the "no mappings" notice
		expect(mockNotice).toHaveBeenCalledWith(
			"Canvas Sync: No course mappings configured. Add courses in settings.",
		);
		expect(mockRequestUrl).not.toHaveBeenCalled();
	});
});

// ─── Successful sync ─────────────────────────────────────────────────────────

describe("successful sync", () => {
	it("creates notes for published assignments", async () => {
		const app = createMockApp();
		const settings = makeSettings();

		const assignments = [
			makeAssignment({ id: 1001, name: "Essay on WWI" }),
			makeAssignment({ id: 1002, name: "Chapter 5 Reading" }),
		];

		mockRequestUrl.mockResolvedValueOnce(mockApiResponse(assignments));

		await syncAssignments(app, settings);

		expect(app.vault.create).toHaveBeenCalledTimes(2);

		const basePath = "2025-2026 - Sophmore/01 - Spring Semester/History/Todo";
		expect(app.vault.create).toHaveBeenCalledWith(
			`${basePath}/Essay on WWI.md`,
			expect.any(String),
		);
		expect(app.vault.create).toHaveBeenCalledWith(
			`${basePath}/Chapter 5 Reading.md`,
			expect.any(String),
		);

		expect(mockNotice).toHaveBeenCalledWith("Sync complete: 2 new assignments created");
	});

	it("creates notes with correct frontmatter", async () => {
		const app = createMockApp();
		const settings = makeSettings();

		const assignment = makeAssignment({
			id: 1001,
			name: "Essay on WWI",
			due_at: "2026-02-15T23:59:00Z",
			html_url: "https://school.instructure.com/courses/101/assignments/1001",
		});

		mockRequestUrl.mockResolvedValueOnce(mockApiResponse([assignment]));

		await syncAssignments(app, settings);

		const content = app.vault.create.mock.calls[0][1] as string;
		expect(content).toContain('canvas-id: "1001"');
		expect(content).toContain('canvas-url: "https://school.instructure.com/courses/101/assignments/1001"');
		expect(content).toContain("due: 2026-02-15");
		expect(content).toContain("status: Todo");
		expect(content).toContain("History/WWI");
		expect(content).toContain("Type/Homework");
		expect(content).toContain("Status/Todo");
	});

	it("skips unpublished assignments", async () => {
		const app = createMockApp();
		const settings = makeSettings();

		const assignments = [
			makeAssignment({ id: 1001, published: true }),
			makeAssignment({ id: 1002, published: false }),
		];

		mockRequestUrl.mockResolvedValueOnce(mockApiResponse(assignments));

		await syncAssignments(app, settings);

		expect(app.vault.create).toHaveBeenCalledTimes(1);
	});

	it("shows syncing notice at start", async () => {
		const app = createMockApp();
		const settings = makeSettings();

		mockRequestUrl.mockResolvedValueOnce(mockApiResponse([]));

		await syncAssignments(app, settings);

		expect(mockNotice).toHaveBeenCalledWith("Syncing assignments from Canvas...");
	});
});

// ─── Skip existing assignments ───────────────────────────────────────────────

describe("skip existing assignments", () => {
	it("does not create notes for assignments already in vault", async () => {
		const basePath = "2025-2026 - Sophmore/01 - Spring Semester/History";
		const todoPath = `${basePath}/Todo`;
		const existingFile = new TFile(`${todoPath}/Existing Essay.md`);

		const app = createMockApp();
		app.vault.getAbstractFileByPath.mockImplementation((path: string) => {
			if (path === todoPath) return { path: todoPath };
			return null;
		});
		app.vault.getFiles.mockReturnValue([existingFile]);
		app.metadataCache.getFileCache.mockImplementation((file: any) => {
			if (file.path === existingFile.path) {
				return { frontmatter: { "canvas-id": "123" } };
			}
			return null;
		});

		const settings = makeSettings();
		const assignments = [makeAssignment({ id: 123, name: "Existing Essay" })];

		mockRequestUrl.mockResolvedValueOnce(mockApiResponse(assignments));

		await syncAssignments(app, settings);

		expect(app.vault.create).not.toHaveBeenCalled();
		expect(mockNotice).toHaveBeenCalledWith("Sync complete: 0 new assignments created");
	});

	it("detects existing canvas-ids across Todo, Working, and Done folders", async () => {
		const basePath = "2025-2026 - Sophmore/01 - Spring Semester/History";
		const workingFile = new TFile(`${basePath}/Working/In Progress.md`);

		const app = createMockApp();
		app.vault.getAbstractFileByPath.mockImplementation((path: string) => {
			if (path === `${basePath}/Working`) return { path: `${basePath}/Working` };
			return null;
		});
		app.vault.getFiles.mockReturnValue([workingFile]);
		app.metadataCache.getFileCache.mockImplementation((file: any) => {
			if (file.path === workingFile.path) {
				return { frontmatter: { "canvas-id": "456" } };
			}
			return null;
		});

		const settings = makeSettings();
		const assignments = [makeAssignment({ id: 456, name: "In Progress" })];

		mockRequestUrl.mockResolvedValueOnce(mockApiResponse(assignments));

		await syncAssignments(app, settings);

		expect(app.vault.create).not.toHaveBeenCalled();
	});

	it("creates notes for new assignments even when some already exist", async () => {
		const basePath = "2025-2026 - Sophmore/01 - Spring Semester/History";
		const todoPath = `${basePath}/Todo`;
		const existingFile = new TFile(`${todoPath}/Old Essay.md`);

		const app = createMockApp();
		app.vault.getAbstractFileByPath.mockImplementation((path: string) => {
			if (path === todoPath) return { path: todoPath };
			return null;
		});
		app.vault.getFiles.mockReturnValue([existingFile]);
		app.metadataCache.getFileCache.mockImplementation((file: any) => {
			if (file.path === existingFile.path) {
				return { frontmatter: { "canvas-id": "100" } };
			}
			return null;
		});

		const settings = makeSettings();
		const assignments = [
			makeAssignment({ id: 100, name: "Old Essay" }),
			makeAssignment({ id: 200, name: "New Essay" }),
		];

		mockRequestUrl.mockResolvedValueOnce(mockApiResponse(assignments));

		await syncAssignments(app, settings);

		expect(app.vault.create).toHaveBeenCalledTimes(1);
		expect(app.vault.create).toHaveBeenCalledWith(
			`${todoPath}/New Essay.md`,
			expect.any(String),
		);
	});
});

// ─── Duplicate filename handling ─────────────────────────────────────────────

describe("duplicate filename handling", () => {
	it("appends assignment id when filename already exists", async () => {
		const basePath = "2025-2026 - Sophmore/01 - Spring Semester/History";
		const todoPath = `${basePath}/Todo`;
		const defaultFilePath = `${todoPath}/Test Assignment.md`;

		const app = createMockApp();
		app.vault.getAbstractFileByPath.mockImplementation((path: string) => {
			if (path === defaultFilePath) return { path: defaultFilePath };
			return null;
		});

		const settings = makeSettings();
		const assignments = [makeAssignment({ id: 1001, name: "Test Assignment" })];

		mockRequestUrl.mockResolvedValueOnce(mockApiResponse(assignments));

		await syncAssignments(app, settings);

		expect(app.vault.create).toHaveBeenCalledWith(
			`${todoPath}/Test Assignment (1001).md`,
			expect.any(String),
		);
	});
});

// ─── Note content format ─────────────────────────────────────────────────────

describe("note content format", () => {
	it("includes due date in frontmatter and formatted date in body", async () => {
		const app = createMockApp();
		const settings = makeSettings();

		const assignment = makeAssignment({ due_at: "2026-02-15T23:59:00Z" });
		mockRequestUrl.mockResolvedValueOnce(mockApiResponse([assignment]));

		await syncAssignments(app, settings);

		const content = app.vault.create.mock.calls[0][1] as string;
		expect(content).toContain("due: 2026-02-15");
		expect(content).toContain("**Due:** February 15, 2026");
	});

	it("omits due field and shows 'No due date' when due_at is null", async () => {
		const app = createMockApp();
		const settings = makeSettings();

		const assignment = makeAssignment({ due_at: null });
		mockRequestUrl.mockResolvedValueOnce(mockApiResponse([assignment]));

		await syncAssignments(app, settings);

		const content = app.vault.create.mock.calls[0][1] as string;
		expect(content).not.toMatch(/^due:/m);
		expect(content).toContain("**Due:** No due date");
	});

	it("shows 'See Canvas for details' when description is null", async () => {
		const app = createMockApp();
		const settings = makeSettings();

		const assignment = makeAssignment({
			description: null,
			html_url: "https://school.instructure.com/courses/101/assignments/1001",
		});
		mockRequestUrl.mockResolvedValueOnce(mockApiResponse([assignment]));

		await syncAssignments(app, settings);

		const content = app.vault.create.mock.calls[0][1] as string;
		expect(content).toContain(
			"See Canvas for details: https://school.instructure.com/courses/101/assignments/1001",
		);
	});

	it("converts HTML description to markdown", async () => {
		const app = createMockApp();
		const settings = makeSettings();

		const assignment = makeAssignment({ description: "<p>Do this</p>" });
		mockRequestUrl.mockResolvedValueOnce(mockApiResponse([assignment]));

		await syncAssignments(app, settings);

		const content = app.vault.create.mock.calls[0][1] as string;
		// htmlToMarkdown should convert <p> tags into plain text
		expect(content).toContain("Do this");
		expect(content).not.toContain("<p>");
	});

	it("includes all expected sections in note body", async () => {
		const app = createMockApp();
		const settings = makeSettings();

		const assignment = makeAssignment();
		mockRequestUrl.mockResolvedValueOnce(mockApiResponse([assignment]));

		await syncAssignments(app, settings);

		const content = app.vault.create.mock.calls[0][1] as string;
		expect(content).toContain("## Assignment");
		expect(content).toContain("**Subject:** History");
		expect(content).toContain("## Instructions");
		expect(content).toContain("## Work");
		expect(content).toContain("## Submission");
		expect(content).toContain("- [ ] Complete assignment");
		expect(content).toContain("- [ ] Review work");
		expect(content).toContain("- [ ] Submit on Canvas");
		expect(content).toContain("## Related");
		expect(content).toContain("[[Dashboard]]");
	});

	it("includes Year/Sophomore tag in frontmatter", async () => {
		const app = createMockApp();
		const settings = makeSettings();

		const assignment = makeAssignment();
		mockRequestUrl.mockResolvedValueOnce(mockApiResponse([assignment]));

		await syncAssignments(app, settings);

		const content = app.vault.create.mock.calls[0][1] as string;
		expect(content).toContain("Year/Sophomore");
	});
});

// ─── Error handling ──────────────────────────────────────────────────────────

describe("error handling", () => {
	it("shows error Notice for a failing course and continues with others", async () => {
		const app = createMockApp();
		const settings = makeSettings({
			courseMappings: {
				"101": {
					canvasCourseName: "History 101",
					subject: "History",
					subjectTag: "History/WWI",
				},
				"202": {
					canvasCourseName: "Math 202",
					subject: "Math",
					subjectTag: "Math/Calc",
				},
			},
		});

		// First course fails
		mockRequestUrl
			.mockRejectedValueOnce(new Error("Network timeout"))
			.mockResolvedValueOnce(mockApiResponse([makeAssignment({ id: 2001, name: "Calculus HW" })]));

		await syncAssignments(app, settings);

		// Error notice for the failed course
		expect(mockNotice).toHaveBeenCalledWith(
			expect.stringContaining("Canvas Sync: Error syncing"),
		);

		// Still created a note for the second course
		expect(app.vault.create).toHaveBeenCalledTimes(1);
		expect(mockNotice).toHaveBeenCalledWith("Sync complete: 1 new assignments created");
	});

	it("handles non-Error thrown values", async () => {
		const app = createMockApp();
		const settings = makeSettings();

		mockRequestUrl.mockRejectedValueOnce("string error");

		await syncAssignments(app, settings);

		expect(mockNotice).toHaveBeenCalledWith(
			"Canvas Sync: Error syncing History: string error",
		);
		expect(mockNotice).toHaveBeenCalledWith("Sync complete: 0 new assignments created");
	});
});

// ─── Folder creation ─────────────────────────────────────────────────────────

describe("folder creation", () => {
	it("creates the Todo folder if it does not exist", async () => {
		const app = createMockApp();
		const settings = makeSettings();

		const assignment = makeAssignment();
		mockRequestUrl.mockResolvedValueOnce(mockApiResponse([assignment]));

		await syncAssignments(app, settings);

		expect(app.vault.createFolder).toHaveBeenCalledWith(
			"2025-2026 - Sophmore/01 - Spring Semester/History/Todo",
		);
	});

	it("does not create the Todo folder if it already exists", async () => {
		const basePath = "2025-2026 - Sophmore/01 - Spring Semester/History";
		const todoPath = `${basePath}/Todo`;

		const app = createMockApp();
		app.vault.getAbstractFileByPath.mockImplementation((path: string) => {
			if (path === todoPath) return { path: todoPath };
			return null;
		});

		const settings = makeSettings();
		const assignment = makeAssignment();
		mockRequestUrl.mockResolvedValueOnce(mockApiResponse([assignment]));

		await syncAssignments(app, settings);

		expect(app.vault.createFolder).not.toHaveBeenCalled();
	});
});
