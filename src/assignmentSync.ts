import { App, Notice, TFile } from "obsidian";
import { CanvasSyncSettings, CourseMappingConfig } from "./settings";
import { fetchAssignments, CanvasAssignment } from "./canvasApi";
import { htmlToMarkdown, sanitizeFilename, formatDate } from "./utils";

function findExistingCanvasIds(
	app: App,
	basePath: string,
	subfolders: string[]
): Set<string> {
	const ids = new Set<string>();
	for (const sub of subfolders) {
		const folderPath = `${basePath}/${sub}`;
		const folder = app.vault.getAbstractFileByPath(folderPath);
		if (!folder) continue;

		const files = app.vault.getFiles().filter(
			(f) => f.path.startsWith(folderPath + "/") && f.extension === "md"
		);
		for (const file of files) {
			const cache = app.metadataCache.getFileCache(file);
			const canvasId = cache?.frontmatter?.["canvas-id"];
			if (canvasId != null) {
				ids.add(String(canvasId));
			}
		}
	}
	return ids;
}

async function ensureFolder(app: App, path: string): Promise<void> {
	if (app.vault.getAbstractFileByPath(path)) return;
	try {
		await app.vault.createFolder(path);
	} catch {
		// folder already exists
	}
}

async function createAssignmentNote(
	app: App,
	assignment: CanvasAssignment,
	mapping: CourseMappingConfig,
	settings: CanvasSyncSettings
): Promise<void> {
	const todoFolder = `${settings.semesterBasePath}/${mapping.subject}/Todo`;
	await ensureFolder(app, todoFolder);

	const baseName = sanitizeFilename(assignment.name);
	let filePath = `${todoFolder}/${baseName}.md`;

	if (app.vault.getAbstractFileByPath(filePath)) {
		filePath = `${todoFolder}/${baseName} (${assignment.id}).md`;
	}

	const tags = [mapping.subjectTag, "Type/Homework", "Year/Sophomore", "Status/Todo"]
		.map((t) => `\t- ${t}`)
		.join("\n");

	const dueFrontmatter = assignment.due_at
		? `\ndue: ${assignment.due_at.slice(0, 10)}`
		: "";

	const dueDisplay = assignment.due_at
		? formatDate(assignment.due_at)
		: "No due date";

	const instructions = assignment.description
		? htmlToMarkdown(assignment.description)
		: `See Canvas for details: ${assignment.html_url}`;

	const content = `---
tags:
${tags}${dueFrontmatter}
status: Todo
canvas-id: "${assignment.id}"
canvas-url: "${assignment.html_url}"
---

## Assignment

**Subject:** ${mapping.subject}
**Due:** ${dueDisplay}

## Instructions

${instructions}

## Work



## Submission

- [ ] Complete assignment
- [ ] Review work
- [ ] Submit on Canvas

## Related

- [[Dashboard]]
`;

	await app.vault.create(filePath, content);
}

export async function syncAssignments(
	app: App,
	settings: CanvasSyncSettings
): Promise<void> {
	if (!settings.canvasBaseUrl || !settings.apiToken) {
		new Notice("Canvas Sync: Please configure your Canvas URL and API token in settings.");
		return;
	}

	const activeMappings = Object.entries(settings.courseMappings).filter(
		([, mapping]) => mapping.subject.length > 0
	);

	if (activeMappings.length === 0) {
		new Notice("Canvas Sync: No course mappings configured. Add courses in settings.");
		return;
	}

	new Notice("Syncing assignments from Canvas...");

	let totalCreated = 0;

	for (const [courseId, mapping] of activeMappings) {
		try {
			const assignments = await fetchAssignments(
				settings.canvasBaseUrl,
				settings.apiToken,
				courseId
			);

			const published = assignments.filter((a) => a.published);

			const existingIds = findExistingCanvasIds(
				app,
				`${settings.semesterBasePath}/${mapping.subject}`,
				["Todo", "Working", "Done"]
			);

			for (const assignment of published) {
				if (existingIds.has(String(assignment.id))) continue;

				await createAssignmentNote(app, assignment, mapping, settings);
				totalCreated++;
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			new Notice(`Canvas Sync: Error syncing ${mapping.subject}: ${msg}`);
		}
	}

	new Notice(`Sync complete: ${totalCreated} new assignments created`);
}
