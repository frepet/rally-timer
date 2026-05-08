import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const content = readFileSync(
	resolve(__dirname, '../../../src/routes/championships/+page.svelte'),
	'utf-8'
);

describe('championships page: rename feature', () => {
	it('imports PenOutline icon', () => {
		expect(content).toMatch(/PenOutline/);
	});

	it('has rename and delete buttons in the selector area', () => {
		// Both icons must appear in the template (after </script>)
		const templateStart = content.indexOf('</script>');
		const template = content.slice(templateStart);
		expect(template).toMatch(/PenOutline/);
		expect(template).toMatch(/TrashBinOutline/);
		// Pen icon should appear before trash icon (pen first, trash second)
		const penIdx = template.indexOf('PenOutline');
		const trashIdx = template.indexOf('TrashBinOutline');
		expect(penIdx).toBeLessThan(trashIdx);
	});

	it('has a renameChampionship function', () => {
		expect(content).toMatch(/async function renameChampionship/);
	});

	it('sends PATCH request to rename endpoint', () => {
		expect(content).toMatch(/method:\s*['"]PATCH['"]/);
	});

	it('has a rename modal with an input field', () => {
		expect(content).toMatch(/[Rr]ename/);
		// Must have a rename modal distinct from create modal
		const renameSection = content.slice(
			content.indexOf('renameModal') || content.indexOf('Rename')
		);
		expect(renameSection).toMatch(/Input/);
	});
});
