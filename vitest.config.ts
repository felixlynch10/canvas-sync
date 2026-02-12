import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	test: {
		globals: true,
		environment: "jsdom",
		alias: {
			obsidian: path.resolve(__dirname, "tests/__mocks__/obsidian.ts"),
		},
		include: ["tests/**/*.test.ts"],
	},
});
