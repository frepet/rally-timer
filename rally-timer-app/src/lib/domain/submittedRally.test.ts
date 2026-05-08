import { describe, it, expect } from 'vitest';
import { buildStageData, type SubmittedRallyResult } from './submittedRally';

const r = (
	stage_name: string,
	driver_name: string,
	class_name: string,
	elapsed_ms: number | null,
	dnf = false
): SubmittedRallyResult => ({ stage_name, driver_name, class_name, elapsed_ms, dnf });

describe('buildStageData (submitted rally)', () => {
	it('returns empty array for no results', () => {
		expect(buildStageData([])).toEqual([]);
	});

	it('produces one StageData per unique stage_name', () => {
		const result = buildStageData([r('SS1', 'Alice', 'A', 4000), r('SS2', 'Alice', 'A', 7000)]);
		expect(result).toHaveLength(2);
		expect(result[0].name).toBe('SS1');
		expect(result[1].name).toBe('SS2');
	});

	it('excludes rows where elapsed_ms is null', () => {
		const result = buildStageData([r('SS1', 'Alice', 'A', null)]);
		expect(result[0].rows).toHaveLength(0);
	});

	it('all stages have status closed', () => {
		const result = buildStageData([r('SS1', 'Alice', 'A', 4000)]);
		expect(result[0].status).toBe('closed');
	});

	it('sorts rows by elapsed_ms and assigns positions', () => {
		const result = buildStageData([r('SS1', 'Bob', 'A', 6000), r('SS1', 'Alice', 'A', 4000)]);
		const rows = result[0].rows;
		expect(rows[0].driver_name).toBe('Alice');
		expect(rows[0].position).toBe(1);
		expect(rows[0].delta_p1).toBe(0);
		expect(rows[1].driver_name).toBe('Bob');
		expect(rows[1].position).toBe(2);
		expect(rows[1].delta_p1).toBe(2000);
	});

	it('preserves dnf flag on rows', () => {
		const result = buildStageData([
			r('SS1', 'Alice', 'A', 4000, false),
			r('SS1', 'Bob', 'A', 36000, true)
		]);
		const rows = result[0].rows;
		expect(rows.find((r) => r.driver_name === 'Alice')!.dnf).toBe(false);
		expect(rows.find((r) => r.driver_name === 'Bob')!.dnf).toBe(true);
	});
});
