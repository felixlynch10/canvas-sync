import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { htmlToMarkdown, sanitizeFilename, formatDate, getUrgency } from "../src/utils";

describe("htmlToMarkdown", () => {
	it("returns empty string for empty input", () => {
		expect(htmlToMarkdown("")).toBe("");
	});

	it("returns empty string for null-like input", () => {
		expect(htmlToMarkdown(null as unknown as string)).toBe("");
		expect(htmlToMarkdown(undefined as unknown as string)).toBe("");
	});

	it("converts a simple paragraph", () => {
		expect(htmlToMarkdown("<p>Hello</p>")).toBe("Hello");
	});

	it("converts bold text", () => {
		expect(htmlToMarkdown("<strong>bold</strong>")).toBe("**bold**");
	});

	it("converts italic text", () => {
		expect(htmlToMarkdown("<em>italic</em>")).toBe("*italic*");
	});

	it("converts a link", () => {
		expect(htmlToMarkdown('<a href="https://example.com">link</a>')).toBe(
			"[link](https://example.com)"
		);
	});

	it("converts h1 heading", () => {
		expect(htmlToMarkdown("<h1>Title</h1>")).toBe("# Title");
	});

	it("converts h2 heading", () => {
		expect(htmlToMarkdown("<h2>Subtitle</h2>")).toBe("## Subtitle");
	});

	it("converts h3 heading", () => {
		expect(htmlToMarkdown("<h3>Section</h3>")).toBe("### Section");
	});

	it("converts an unordered list", () => {
		const html = "<ul><li>First</li><li>Second</li><li>Third</li></ul>";
		const result = htmlToMarkdown(html);
		expect(result).toContain("- First");
		expect(result).toContain("- Second");
		expect(result).toContain("- Third");
	});

	it("converts an ordered list", () => {
		const html = "<ol><li>First</li><li>Second</li><li>Third</li></ol>";
		const result = htmlToMarkdown(html);
		expect(result).toContain("1. First");
		expect(result).toContain("2. Second");
		expect(result).toContain("3. Third");
	});

	it("converts a blockquote", () => {
		const result = htmlToMarkdown("<blockquote>Quoted text</blockquote>");
		expect(result).toContain("> Quoted text");
	});

	it("converts a fenced code block", () => {
		const result = htmlToMarkdown("<pre><code>const x = 1;</code></pre>");
		expect(result).toContain("```");
		expect(result).toContain("const x = 1;");
	});

	it("converts inline code", () => {
		expect(htmlToMarkdown("<code>inline</code>")).toBe("`inline`");
	});

	it("converts a table with header and rows", () => {
		const html = `
			<table>
				<thead><tr><th>Name</th><th>Age</th></tr></thead>
				<tbody>
					<tr><td>Alice</td><td>30</td></tr>
					<tr><td>Bob</td><td>25</td></tr>
				</tbody>
			</table>
		`;
		const result = htmlToMarkdown(html);
		expect(result).toContain("Name");
		expect(result).toContain("Age");
		expect(result).toContain("Alice");
		expect(result).toContain("30");
		expect(result).toContain("Bob");
		expect(result).toContain("25");
		expect(result).toContain("|");
		expect(result).toContain("---");
	});

	it("handles nested bold and italic", () => {
		const result = htmlToMarkdown("<p><strong>bold <em>and italic</em></strong></p>");
		expect(result).toContain("**bold *and italic***");
	});

	it("strips canvas-style wrapper divs", () => {
		const html = '<div class="canvas-container"><p>content</p></div>';
		expect(htmlToMarkdown(html)).toBe("content");
	});

	it("produces clean output without excessive newlines for multiple paragraphs", () => {
		const html = "<p>First paragraph</p><p>Second paragraph</p><p>Third paragraph</p>";
		const result = htmlToMarkdown(html);
		expect(result).not.toMatch(/\n{3,}/);
		expect(result).toContain("First paragraph");
		expect(result).toContain("Second paragraph");
		expect(result).toContain("Third paragraph");
	});
});

describe("sanitizeFilename", () => {
	it("passes through a normal name unchanged", () => {
		expect(sanitizeFilename("my-file-name")).toBe("my-file-name");
	});

	it("strips all illegal characters", () => {
		expect(sanitizeFilename('file/name\\with:illegal*chars?"<>|')).toBe(
			"filenamewithillegalchars"
		);
	});

	it("collapses multiple spaces into one", () => {
		expect(sanitizeFilename("too   many    spaces")).toBe("too many spaces");
	});

	it("trims leading and trailing whitespace", () => {
		expect(sanitizeFilename("  padded name  ")).toBe("padded name");
	});

	it("truncates to 100 characters", () => {
		const longName = "a".repeat(150);
		const result = sanitizeFilename(longName);
		expect(result.length).toBe(100);
	});

	it("returns empty string for empty input", () => {
		expect(sanitizeFilename("")).toBe("");
	});

	it("strips illegal chars and collapses whitespace together", () => {
		expect(sanitizeFilename("  hello / world : test  ")).toBe("hello world test");
	});
});

describe("formatDate", () => {
	it("formats an ISO date string correctly", () => {
		const result = formatDate("2026-02-12T12:00:00Z");
		expect(result).toBe("February 12, 2026");
	});

	it("formats a different month and day", () => {
		const result = formatDate("2025-07-04T12:00:00Z");
		expect(result).toBe("July 4, 2025");
	});

	it("formats December 25", () => {
		const result = formatDate("2026-12-25T12:00:00Z");
		expect(result).toBe("December 25, 2026");
	});
});

describe("getUrgency", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-02-12"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns "none" for null', () => {
		expect(getUrgency(null)).toBe("none");
	});

	it('returns "overdue" for a date in the past', () => {
		expect(getUrgency("2026-02-10")).toBe("overdue");
	});

	it('returns "today" for today\'s date', () => {
		expect(getUrgency("2026-02-12")).toBe("today");
	});

	it('returns "tomorrow" for tomorrow\'s date', () => {
		expect(getUrgency("2026-02-13")).toBe("tomorrow");
	});

	it('returns "week" for 3 days from now', () => {
		expect(getUrgency("2026-02-15")).toBe("week");
	});

	it('returns "week" for 7 days from now', () => {
		expect(getUrgency("2026-02-19")).toBe("week");
	});

	it('returns "later" for 8 days from now', () => {
		expect(getUrgency("2026-02-20")).toBe("later");
	});
});
