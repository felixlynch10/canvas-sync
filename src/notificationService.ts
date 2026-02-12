import { App } from "obsidian";
import { CanvasSyncSettings } from "./settings";
import { getUrgency } from "./utils";

export function checkAndNotify(
	app: App,
	settings: CanvasSyncSettings,
	sentKeys: Set<string>
): void {
	if (!settings.notificationsEnabled) return;

	const allFiles = app.vault.getFiles();
	const todoFiles = allFiles.filter(
		(f) =>
			f.path.startsWith(settings.semesterBasePath) &&
			f.path.contains("/Todo/") &&
			f.extension === "md"
	);

	const currentHour = new Date().getHours();

	for (const file of todoFiles) {
		const cache = app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter;
		const due = fm?.due ?? null;
		if (!due) continue;

		const pathParts = file.path.split("/");
		const todoIdx = pathParts.indexOf("Todo");
		const subject = todoIdx > 0 ? pathParts[todoIdx - 1] : "Unknown";
		const urgency = getUrgency(due);

		if (urgency === "tomorrow" && settings.notifyEveningBefore && currentHour >= 18) {
			const key = `${file.path}:eve`;
			if (!sentKeys.has(key)) {
				const notification = new Notification(`Due Tomorrow: ${file.basename}`, {
					body: `Subject: ${subject}`,
				});
				notification.onclick = () => app.workspace.openLinkText(file.path, "");
				sentKeys.add(key);
			}
		}

		if (urgency === "today" && settings.notifyMorningOf && currentHour >= 8) {
			const key = `${file.path}:morning`;
			if (!sentKeys.has(key)) {
				const notification = new Notification(`Due Today: ${file.basename}`, {
					body: `Subject: ${subject}`,
				});
				notification.onclick = () => app.workspace.openLinkText(file.path, "");
				sentKeys.add(key);
			}
		}
	}
}

export function clearStaleKeys(sentKeys: Set<string>, todayStr: string, lastDate: string): boolean {
	if (lastDate !== todayStr) {
		sentKeys.clear();
		return true;
	}
	return false;
}
