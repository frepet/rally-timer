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
	it('"Inga sträckor än." in rallies page', () => {
		const content = readTemplate('src/routes/rallies/+page.svelte');
		const match = content.match(/class="([^"]*)"[^>]*>\s*Inga sträckor än\.\s*<\/\w+>/);
		expect(match).not.toBeNull();
		expect(match![1]).toMatch(/dark:text-/);
	});

	it('"Inga förare/Inga träffar" li in rallies page', () => {
		const content = readTemplate('src/routes/rallies/+page.svelte');
		const match = content.match(/<li class="([^"]*)">[^<]*Inga förare[^<]*<\/li>/);
		expect(match).not.toBeNull();
		expect(match![1]).toMatch(/dark:text-/);
	});

	it('"Inga resultat än." in RallyResults', () => {
		const content = readTemplate('src/lib/RallyResults.svelte');
		const match = content.match(/class="([^"]*)"[^>]*>Inga resultat än\.<\/\w+>/);
		expect(match).not.toBeNull();
		expect(match![1]).toMatch(/dark:text-/);
	});

	it('"Inga sträckor än." in RallyResults', () => {
		const content = readTemplate('src/lib/RallyResults.svelte');
		const match = content.match(/class="([^"]*)"[^>]*>Inga sträckor än\.<\/\w+>/);
		expect(match).not.toBeNull();
		expect(match![1]).toMatch(/dark:text-/);
	});

	it('"Inga sträckaresultat än." in RallyResults', () => {
		const content = readTemplate('src/lib/RallyResults.svelte');
		const match = content.match(/class="([^"]*)"[^>]*>Inga sträckaresultat än\.<\/\w+>/);
		expect(match).not.toBeNull();
		expect(match![1]).toMatch(/dark:text-/);
	});
});
