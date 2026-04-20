import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(__dirname, '../..');

function readTemplate(relativePath: string) {
	return readFileSync(resolve(root, relativePath), 'utf-8');
}

// Each empty-state element must carry an explicit dark:text-* class so it
// stays readable when the page is rendered in dark mode.
describe('dark mode: empty-state elements must have explicit dark text color', () => {
	it('"No stages yet." in rallies page', () => {
		const content = readTemplate('src/routes/rallies/+page.svelte');
		const match = content.match(/class="([^"]*)"[^>]*>No stages yet\.<\/\w+>/);
		expect(match).not.toBeNull();
		expect(match![1]).toMatch(/dark:text-/);
	});

	it('"No drivers/No matches" li in rallies page', () => {
		const content = readTemplate('src/routes/rallies/+page.svelte');
		const match = content.match(/<li class="([^"]*)">[^<]*No drivers[^<]*<\/li>/);
		expect(match).not.toBeNull();
		expect(match![1]).toMatch(/dark:text-/);
	});

	it('"No results yet." in RallyResults', () => {
		const content = readTemplate('src/lib/RallyResults.svelte');
		const match = content.match(/class="([^"]*)"[^>]*>No results yet\.<\/\w+>/);
		expect(match).not.toBeNull();
		expect(match![1]).toMatch(/dark:text-/);
	});

	it('"No stages yet." in RallyResults', () => {
		const content = readTemplate('src/lib/RallyResults.svelte');
		const match = content.match(/class="([^"]*)"[^>]*>No stages yet\.<\/\w+>/);
		expect(match).not.toBeNull();
		expect(match![1]).toMatch(/dark:text-/);
	});

	it('"No stage results yet." in RallyResults', () => {
		const content = readTemplate('src/lib/RallyResults.svelte');
		const match = content.match(/class="([^"]*)"[^>]*>No stage results yet\.<\/\w+>/);
		expect(match).not.toBeNull();
		expect(match![1]).toMatch(/dark:text-/);
	});
});
