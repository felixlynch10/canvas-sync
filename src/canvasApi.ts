import { requestUrl } from "obsidian";

export interface CanvasCourse {
	id: number;
	name: string;
	course_code: string;
}

export interface CanvasAssignment {
	id: number;
	name: string;
	description: string | null;
	due_at: string | null;
	html_url: string;
	course_id: number;
	points_possible: number | null;
	submission_types: string[];
	published: boolean;
}

function normalizeBaseUrl(baseUrl: string): string {
	return baseUrl.replace(/\/+$/, "");
}

export function parseLinkHeader(
	linkHeader: string
): Record<string, string> {
	const links: Record<string, string> = {};
	const parts = linkHeader.split(",");
	for (const part of parts) {
		const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
		if (match) {
			links[match[2]] = match[1];
		}
	}
	return links;
}

export async function fetchActiveCourses(
	baseUrl: string,
	token: string
): Promise<CanvasCourse[]> {
	const url = `${normalizeBaseUrl(baseUrl)}/api/v1/courses?enrollment_state=active&per_page=50`;
	const response = await requestUrl({
		url,
		method: "GET",
		headers: {
			Authorization: `Bearer ${token}`,
		},
	});

	if (response.status !== 200) {
		throw new Error(`Failed to fetch courses: ${response.status}`);
	}

	return JSON.parse(response.text) as CanvasCourse[];
}

export async function fetchAssignments(
	baseUrl: string,
	token: string,
	courseId: string
): Promise<CanvasAssignment[]> {
	const normalized = normalizeBaseUrl(baseUrl);
	let url: string | null = `${normalized}/api/v1/courses/${courseId}/assignments?order_by=due_at&per_page=100`;
	const allAssignments: CanvasAssignment[] = [];

	while (url) {
		const response = await requestUrl({
			url,
			method: "GET",
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		if (response.status !== 200) {
			throw new Error(
				`Failed to fetch assignments for course ${courseId}: ${response.status}`
			);
		}

		const assignments = JSON.parse(
			response.text
		) as CanvasAssignment[];
		allAssignments.push(...assignments);

		const linkHeader = response.headers["link"] || response.headers["Link"];
		if (linkHeader) {
			const links = parseLinkHeader(linkHeader);
			url = links["next"] || null;
		} else {
			url = null;
		}
	}

	return allAssignments;
}
