export function htmlToMarkdown(html: string): string {
	if (!html) return "";

	const doc = new DOMParser().parseFromString(html, "text/html");
	return walkNodes(doc.body).replace(/\n{3,}/g, "\n\n").trim();
}

function walkNodes(node: Node): string {
	if (node.nodeType === Node.TEXT_NODE) {
		return node.textContent || "";
	}

	if (node.nodeType !== Node.ELEMENT_NODE) return "";

	const el = node as HTMLElement;
	const tag = el.tagName.toLowerCase();
	const children = () => Array.from(el.childNodes).map(walkNodes).join("");

	switch (tag) {
		case "p":
			return "\n\n" + children() + "\n\n";
		case "br":
			return "\n";
		case "strong":
		case "b":
			return "**" + children() + "**";
		case "em":
		case "i":
			return "*" + children() + "*";
		case "a": {
			const href = el.getAttribute("href") || "";
			return "[" + children() + "](" + href + ")";
		}
		case "h1":
			return "\n\n# " + children() + "\n\n";
		case "h2":
			return "\n\n## " + children() + "\n\n";
		case "h3":
			return "\n\n### " + children() + "\n\n";
		case "h4":
			return "\n\n#### " + children() + "\n\n";
		case "h5":
			return "\n\n##### " + children() + "\n\n";
		case "h6":
			return "\n\n###### " + children() + "\n\n";
		case "ul":
			return "\n\n" + processListItems(el, "ul") + "\n\n";
		case "ol":
			return "\n\n" + processListItems(el, "ol") + "\n\n";
		case "li":
			return children();
		case "blockquote":
			return "\n\n" + children().trim().split("\n").map((line) => "> " + line).join("\n") + "\n\n";
		case "pre": {
			const code = el.querySelector("code");
			const text = code ? (code.textContent || "") : (el.textContent || "");
			return "\n\n```\n" + text + "\n```\n\n";
		}
		case "code":
			if (el.parentElement?.tagName.toLowerCase() === "pre") {
				return el.textContent || "";
			}
			return "`" + (el.textContent || "") + "`";
		case "table":
			return "\n\n" + processTable(el) + "\n\n";
		case "div":
		case "span":
		case "section":
		case "article":
		case "main":
		case "header":
		case "footer":
		case "nav":
			return children();
		default:
			return children();
	}
}

function processListItems(el: HTMLElement, type: "ul" | "ol"): string {
	const items: string[] = [];
	let index = 1;
	for (const child of Array.from(el.children)) {
		if (child.tagName.toLowerCase() === "li") {
			const prefix = type === "ul" ? "- " : `${index}. `;
			items.push(prefix + walkNodes(child).trim());
			index++;
		}
	}
	return items.join("\n");
}

function processTable(table: HTMLElement): string {
	const rows: string[][] = [];
	for (const tr of Array.from(table.querySelectorAll("tr"))) {
		const cells: string[] = [];
		for (const cell of Array.from(tr.querySelectorAll("th, td"))) {
			cells.push(walkNodes(cell).trim());
		}
		rows.push(cells);
	}

	if (rows.length === 0) return "";

	const colCount = Math.max(...rows.map((r) => r.length));
	const lines: string[] = [];

	for (let i = 0; i < rows.length; i++) {
		while (rows[i].length < colCount) rows[i].push("");
		lines.push("| " + rows[i].join(" | ") + " |");
		if (i === 0) {
			lines.push("| " + rows[i].map(() => "---").join(" | ") + " |");
		}
	}

	return lines.join("\n");
}

export function sanitizeFilename(name: string): string {
	return name
		.replace(/[/\\:*?"<>|]/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 100);
}

export function formatDate(iso: string): string {
	const date = new Date(iso);
	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

export type Urgency = "overdue" | "today" | "tomorrow" | "week" | "later" | "none";

export function getUrgency(due: string | null): Urgency {
	if (!due) return "none";

	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const dueDate = new Date(due);
	const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());

	const diffMs = dueDateOnly.getTime() - today.getTime();
	const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

	if (diffDays < 0) return "overdue";
	if (diffDays === 0) return "today";
	if (diffDays === 1) return "tomorrow";
	if (diffDays <= 7) return "week";
	return "later";
}
