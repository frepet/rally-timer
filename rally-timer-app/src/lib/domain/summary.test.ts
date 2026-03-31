import { describe, it, expect } from 'vitest';
import { buildStageData, buildRallyRows } from './summary';

// Minimal fixture helpers
const driver = (
	id: number,
	name: string,
	class_name: string,
	rfid_tag: string | null = `tag${id}`
) => ({ id, name, class_name, rfid_tag });

const stage = (id: number, name = `SS${id}`) => ({ id, name });
const start = (driver_id: number, stage_id: number, ts: number) => ({ driver_id, stage_id, ts });
const finish = (stage_id: number, tag: string, ts: number) => ({ stage_id, tag, ts });

describe('buildStageData', () => {
	it('returns empty array when there are no stages', () => {
		expect(buildStageData([], [], [], [])).toEqual([]);
	});

	it('returns a stage with empty rows when no driver has a time', () => {
		const result = buildStageData([driver(1, 'Alice', 'A')], [stage(1)], [], []);
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('SS1');
		expect(result[0].rows).toHaveLength(0);
	});

	it('excludes drivers that have no rfid_tag', () => {
		const result = buildStageData(
			[driver(1, 'Alice', 'A', null)],
			[stage(1)],
			[start(1, 1, 1000)],
			[finish(1, 'tag1', 5000)]
		);
		expect(result[0].rows).toHaveLength(0);
	});

	it('computes elapsed time for a driver with start and finish', () => {
		const result = buildStageData(
			[driver(1, 'Alice', 'A', 'tagA')],
			[stage(1)],
			[start(1, 1, 1000)],
			[finish(1, 'tagA', 5000)]
		);
		expect(result[0].rows).toHaveLength(1);
		expect(result[0].rows[0].stage_ms).toBe(4000);
		expect(result[0].rows[0].driver_name).toBe('Alice');
		expect(result[0].rows[0].class_name).toBe('A');
	});

	it('assigns positions and deltas to rows sorted by stage_ms', () => {
		const result = buildStageData(
			[driver(1, 'Alice', 'A', 'tagA'), driver(2, 'Bob', 'A', 'tagB')],
			[stage(1)],
			[start(1, 1, 1000), start(2, 1, 1000)],
			[finish(1, 'tagA', 5000), finish(1, 'tagB', 8000)]
		);
		const rows = result[0].rows;
		expect(rows).toHaveLength(2);
		expect(rows[0].driver_name).toBe('Alice');
		expect(rows[0].position).toBe(1);
		expect(rows[0].delta_p1).toBe(0);
		expect(rows[1].driver_name).toBe('Bob');
		expect(rows[1].position).toBe(2);
		expect(rows[1].delta_p1).toBe(3000);
	});

	it('ignores finish events that belong to a different stage', () => {
		const result = buildStageData(
			[driver(1, 'Alice', 'A', 'tagA')],
			[stage(1)],
			[start(1, 1, 1000)],
			[finish(2, 'tagA', 5000)] // stage_id=2 != stage.id=1
		);
		expect(result[0].rows).toHaveLength(0);
	});

	it('produces one entry per stage when multiple stages exist', () => {
		const result = buildStageData(
			[driver(1, 'Alice', 'A', 'tagA')],
			[stage(1), stage(2)],
			[start(1, 1, 1000), start(1, 2, 2000)],
			[finish(1, 'tagA', 5000), finish(2, 'tagA', 9000)]
		);
		expect(result).toHaveLength(2);
		expect(result[0].rows[0].stage_ms).toBe(4000);
		expect(result[1].rows[0].stage_ms).toBe(7000);
	});

	it('matches finish tag using string coercion', () => {
		// Driver rfid_tag is a number-string, finish tag is also a numeric string
		const result = buildStageData(
			[driver(1, 'Alice', 'A', '42')],
			[stage(1)],
			[start(1, 1, 1000)],
			[finish(1, '42', 5000)]
		);
		expect(result[0].rows).toHaveLength(1);
	});
});

describe('buildRallyRows', () => {
	it('returns empty array for empty stage data', () => {
		expect(buildRallyRows([])).toEqual([]);
	});

	it('returns one row per driver with finished_stages count', () => {
		const stageData = [
			{
				name: 'SS1',
				rows: [
					{
						driver_name: 'Alice',
						class_name: 'A',
						stage_ms: 4000,
						position: 1,
						delta_p1: 0,
						delta_prev: null
					}
				]
			}
		];
		const rows = buildRallyRows(stageData);
		expect(rows).toHaveLength(1);
		expect(rows[0].driver_name).toBe('Alice');
		expect(rows[0].total_ms).toBe(4000);
		expect(rows[0].finished_stages).toBe(1);
	});

	it('sums stage times across multiple stages for the same driver', () => {
		const stageData = [
			{
				name: 'SS1',
				rows: [
					{
						driver_name: 'Alice',
						class_name: 'A',
						stage_ms: 4000,
						position: 1,
						delta_p1: 0,
						delta_prev: null
					}
				]
			},
			{
				name: 'SS2',
				rows: [
					{
						driver_name: 'Alice',
						class_name: 'A',
						stage_ms: 7000,
						position: 1,
						delta_p1: 0,
						delta_prev: null
					}
				]
			}
		];
		const rows = buildRallyRows(stageData);
		expect(rows).toHaveLength(1);
		expect(rows[0].total_ms).toBe(11000);
		expect(rows[0].finished_stages).toBe(2);
	});

	it('assigns positions sorted by total_ms', () => {
		const stageData = [
			{
				name: 'SS1',
				rows: [
					{
						driver_name: 'Alice',
						class_name: 'A',
						stage_ms: 4000,
						position: 1,
						delta_p1: 0,
						delta_prev: null
					},
					{
						driver_name: 'Bob',
						class_name: 'A',
						stage_ms: 5000,
						position: 2,
						delta_p1: 1000,
						delta_prev: 1000
					}
				]
			}
		];
		const rows = buildRallyRows(stageData);
		expect(rows[0].driver_name).toBe('Alice');
		expect(rows[0].position).toBe(1);
		expect(rows[1].driver_name).toBe('Bob');
		expect(rows[1].position).toBe(2);
	});

	it('driver with more finished stages but slower total stays behind faster total', () => {
		// Diana: SS1=4000, SS2=3000 → total=7000, 2 stages
		// Bob: SS1=8000 → total=8000, 1 stage
		const stageData = [
			{
				name: 'SS1',
				rows: [
					{
						driver_name: 'Diana',
						class_name: 'A',
						stage_ms: 4000,
						position: 1,
						delta_p1: 0,
						delta_prev: null
					},
					{
						driver_name: 'Bob',
						class_name: 'A',
						stage_ms: 8000,
						position: 2,
						delta_p1: 4000,
						delta_prev: 4000
					}
				]
			},
			{
				name: 'SS2',
				rows: [
					{
						driver_name: 'Diana',
						class_name: 'A',
						stage_ms: 3000,
						position: 1,
						delta_p1: 0,
						delta_prev: null
					}
				]
			}
		];
		const rows = buildRallyRows(stageData);
		expect(rows[0].driver_name).toBe('Diana');
		expect(rows[0].total_ms).toBe(7000);
		expect(rows[1].driver_name).toBe('Bob');
		expect(rows[1].total_ms).toBe(8000);
	});
});
