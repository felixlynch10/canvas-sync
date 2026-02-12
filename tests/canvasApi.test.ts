import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseLinkHeader, fetchActiveCourses, fetchAssignments } from "../src/canvasApi";
import { requestUrl } from "obsidian";

const mockRequestUrl = requestUrl as ReturnType<typeof vi.fn>;

function mockResponse(data: unknown, status = 200, headers: Record<string, string> = {}) {
	return { status, text: JSON.stringify(data), headers };
}

beforeEach(() => {
	mockRequestUrl.mockReset();
});

describe("parseLinkHeader", () => {
	it("parses a single rel", () => {
		const result = parseLinkHeader('<https://example.com/page2>; rel="next"');
		expect(result).toEqual({ next: "https://example.com/page2" });
	});

	it("parses multiple rels", () => {
		const header =
			'<https://example.com/page2>; rel="next", <https://example.com/page5>; rel="last"';
		const result = parseLinkHeader(header);
		expect(result).toEqual({
			next: "https://example.com/page2",
			last: "https://example.com/page5",
		});
	});

	it("returns empty object for empty string", () => {
		expect(parseLinkHeader("")).toEqual({});
	});

	it("returns empty object for malformed input", () => {
		expect(parseLinkHeader("not a valid link header")).toEqual({});
	});
});

describe("fetchActiveCourses", () => {
	const baseUrl = "https://canvas.example.com";
	const token = "test-token-123";

	const sampleCourses = [
		{ id: 1, name: "Intro to CS", course_code: "CS101" },
		{ id: 2, name: "Calculus", course_code: "MATH201" },
	];

	it("returns parsed courses on success", async () => {
		mockRequestUrl.mockResolvedValueOnce(mockResponse(sampleCourses));

		const result = await fetchActiveCourses(baseUrl, token);
		expect(result).toEqual(sampleCourses);
	});

	it("strips trailing slashes from the base URL", async () => {
		mockRequestUrl.mockResolvedValueOnce(mockResponse(sampleCourses));

		await fetchActiveCourses("https://canvas.example.com///", token);

		expect(mockRequestUrl).toHaveBeenCalledWith(
			expect.objectContaining({
				url: "https://canvas.example.com/api/v1/courses?enrollment_state=active&per_page=50",
			}),
		);
	});

	it("sends correct Authorization header", async () => {
		mockRequestUrl.mockResolvedValueOnce(mockResponse(sampleCourses));

		await fetchActiveCourses(baseUrl, token);

		expect(mockRequestUrl).toHaveBeenCalledWith(
			expect.objectContaining({
				headers: { Authorization: "Bearer test-token-123" },
			}),
		);
	});

	it("throws on non-200 status", async () => {
		mockRequestUrl.mockResolvedValueOnce(mockResponse([], 401));

		await expect(fetchActiveCourses(baseUrl, token)).rejects.toThrow(
			"Failed to fetch courses: 401",
		);
	});
});

describe("fetchAssignments", () => {
	const baseUrl = "https://canvas.example.com";
	const token = "test-token-123";
	const courseId = "42";

	const page1 = [
		{
			id: 1,
			name: "Homework 1",
			description: "First homework",
			due_at: "2026-03-01T23:59:00Z",
			html_url: "https://canvas.example.com/courses/42/assignments/1",
			course_id: 42,
			points_possible: 100,
			submission_types: ["online_upload"],
			published: true,
		},
	];

	const page2 = [
		{
			id: 2,
			name: "Homework 2",
			description: null,
			due_at: null,
			html_url: "https://canvas.example.com/courses/42/assignments/2",
			course_id: 42,
			points_possible: 50,
			submission_types: ["online_text_entry"],
			published: true,
		},
	];

	it("returns assignments from a single page (no Link header)", async () => {
		mockRequestUrl.mockResolvedValueOnce(mockResponse(page1));

		const result = await fetchAssignments(baseUrl, token, courseId);
		expect(result).toEqual(page1);
		expect(mockRequestUrl).toHaveBeenCalledTimes(1);
	});

	it("follows pagination and combines results from multiple pages", async () => {
		const nextUrl = "https://canvas.example.com/api/v1/courses/42/assignments?page=2&per_page=100";

		mockRequestUrl
			.mockResolvedValueOnce(
				mockResponse(page1, 200, {
					link: `<${nextUrl}>; rel="next", <${nextUrl}>; rel="last"`,
				}),
			)
			.mockResolvedValueOnce(mockResponse(page2));

		const result = await fetchAssignments(baseUrl, token, courseId);

		expect(result).toEqual([...page1, ...page2]);
		expect(mockRequestUrl).toHaveBeenCalledTimes(2);
		expect(mockRequestUrl).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ url: nextUrl }),
		);
	});

	it("throws on non-200 status", async () => {
		mockRequestUrl.mockResolvedValueOnce(mockResponse([], 500));

		await expect(fetchAssignments(baseUrl, token, courseId)).rejects.toThrow(
			"Failed to fetch assignments for course 42: 500",
		);
	});
});
