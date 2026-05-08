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
	it('"t.noStagesYet" in rallies page', () => {
		const content = readTemplate('src/routes/rallies/+page.svelte');
		const match = content.match(/class="([^"]*)"[^>]*>\s*\{t\.noStagesYet\}\s*<\/\w+>/);
		expect(match).not.toBeNull();
		expect(match![1]).toMatch(/dark:text-/);
	});

	it('"t.noMatches / t.noDrivers" li in rallies page', () => {
		const content = readTemplate('src/routes/rallies/+page.svelte');
		const match = content.match(
			/<li class="([^"]*)">[^<]*\{driverSearch \? t\.noMatches : t\.noDrivers\}[^<]*<\/li>/
		);
		expect(match).not.toBeNull();
		expect(match![1]).toMatch(/dark:text-/);
	});

	it('"t.noResultsYet" in RallyResults', () => {
		const content = readTemplate('src/lib/RallyResults.svelte');
		const match = content.match(/class="([^"]*)"[^>]*>\{t\.noResultsYet\}<\/\w+>/);
		expect(match).not.toBeNull();
		expect(match![1]).toMatch(/dark:text-/);
	});

	it('"t.noStagesYet" in RallyResults', () => {
		const content = readTemplate('src/lib/RallyResults.svelte');
		const match = content.match(/class="([^"]*)"[^>]*>\{t\.noStagesYet\}<\/\w+>/);
		expect(match).not.toBeNull();
		expect(match![1]).toMatch(/dark:text-/);
	});

	it('"t.noStageResultsYet" in RallyResults', () => {
		const content = readTemplate('src/lib/RallyResults.svelte');
		const match = content.match(/class="([^"]*)"[^>]*>\{t\.noStageResultsYet\}<\/\w+>/);
		expect(match).not.toBeNull();
		expect(match![1]).toMatch(/dark:text-/);
	});
});
