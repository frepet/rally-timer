import { describe, it, expect } from 'vitest';
import { buildStageTimes } from './rallySubmission';

const startRow = (
	driver_id: number,
	stage_id: number,
	ts_ms: number,
	opts: {
		driver_uuid?: string;
		driver_name?: string;
		driver_tag?: string;
		class_id?: number;
		class_name?: string;
		stage_name?: string;
	} = {}
) => ({
	driver_id,
	stage_id,
	ts_ms,
	driver_uuid: opts.driver_uuid ?? `uuid-${driver_id}`,
	driver_name: opts.driver_name ?? `Driver${driver_id}`,
	driver_tag: opts.driver_tag ?? `tag${driver_id}`,
	class_id: opts.class_id ?? 1,
	class_name: opts.class_name ?? 'ClassA',
	stage_name: opts.stage_name ?? `SS${stage_id}`
});

const finishRow = (stage_id: number, tag: string, timestamp: number, dnf = false, penalty_ms = 0) => ({
	stage_id,
	tag,
	timestamp,
	dnf,
	penalty_ms
});

describe('buildStageTimes', () => {
	it('returns empty array when there are no start events', () => {
		expect(buildStageTimes([], [])).toEqual([]);
	});

	it('returns a result with null elapsed_ms when no matching finish', () => {
		const result = buildStageTimes([startRow(1, 1, 1000)], []);
		expect(result).toHaveLength(1);
		expect(result[0].elapsed_ms).toBeNull();
		expect(result[0].driver_uuid).toBe('uuid-1');
		expect(result[0].driver_name).toBe('Driver1');
		expect(result[0].stage_name).toBe('SS1');
	});

	it('computes elapsed_ms for matching start and finish', () => {
		const result = buildStageTimes(
			[startRow(1, 1, 1000, { driver_tag: 'tagA' })],
			[finishRow(1, 'tagA', 5000)]
		);
		expect(result[0].elapsed_ms).toBe(4000);
	});

	it('groups multiple starts for same driver+stage into one entry', () => {
		const result = buildStageTimes(
			[startRow(1, 1, 1000), startRow(1, 1, 2000)], // two starts for same driver+stage
			[finishRow(1, 'tag1', 6000)]
		);
		expect(result).toHaveLength(1);
		// latest start (2000) is used, elapsed = 6000-2000 = 4000
		expect(result[0].elapsed_ms).toBe(4000);
	});

	it('creates separate entries for different drivers in same stage', () => {
		const result = buildStageTimes(
			[startRow(1, 1, 1000, { driver_tag: 'tagA' }), startRow(2, 1, 1000, { driver_tag: 'tagB' })],
			[finishRow(1, 'tagA', 5000), finishRow(1, 'tagB', 8000)]
		);
		expect(result).toHaveLength(2);
		const alice = result.find((r) => r.driver_uuid === 'uuid-1');
		const bob = result.find((r) => r.driver_uuid === 'uuid-2');
		expect(alice?.elapsed_ms).toBe(4000);
		expect(bob?.elapsed_ms).toBe(7000);
	});

	it('creates separate entries for same driver in different stages', () => {
		const result = buildStageTimes(
			[
				startRow(1, 1, 1000, { driver_tag: 'tagA', stage_name: 'SS1' }),
				startRow(1, 2, 2000, { driver_tag: 'tagA', stage_name: 'SS2' })
			],
			[finishRow(1, 'tagA', 5000), finishRow(2, 'tagA', 9000)]
		);
		expect(result).toHaveLength(2);
		const ss1 = result.find((r) => r.stage_name === 'SS1');
		const ss2 = result.find((r) => r.stage_name === 'SS2');
		expect(ss1?.elapsed_ms).toBe(4000);
		expect(ss2?.elapsed_ms).toBe(7000);
	});

	it('ignores finishes from a different stage', () => {
		const result = buildStageTimes(
			[startRow(1, 1, 1000, { driver_tag: 'tagA' })],
			[finishRow(2, 'tagA', 5000)] // wrong stage
		);
		expect(result[0].elapsed_ms).toBeNull();
	});

	it('preserves all driver metadata in the output', () => {
		const result = buildStageTimes(
			[
				startRow(1, 1, 1000, {
					driver_uuid: 'abc-123',
					driver_name: 'Alice',
					driver_tag: 'tagA',
					class_id: 7,
					class_name: 'GroupB',
					stage_name: 'Norway SS1'
				})
			],
			[]
		);
		expect(result[0]).toMatchObject({
			driver_uuid: 'abc-123',
			driver_name: 'Alice',
			class_id: 7,
			class_name: 'GroupB',
			stage_name: 'Norway SS1',
			elapsed_ms: null
		});
	});

	it('dnf is false for a driver with a real finish', () => {
		const result = buildStageTimes(
			[startRow(1, 1, 1000, { driver_tag: 'tagA' })],
			[finishRow(1, 'tagA', 5000, false)]
		);
		expect(result[0].elapsed_ms).toBe(4000);
		expect(result[0].dnf).toBe(false);
	});

	it('dnf is true when the matching finish event is a synthetic DNF finish', () => {
		const result = buildStageTimes(
			[startRow(1, 1, 1000, { driver_tag: 'tagA' })],
			[finishRow(1, 'tagA', 31000, true)] // synthetic: start + 30 s penalty
		);
		expect(result[0].elapsed_ms).toBe(30000);
		expect(result[0].dnf).toBe(true);
	});

	it('dnf is false when no finish event exists (pre-close-stage state)', () => {
		const result = buildStageTimes([startRow(1, 1, 1000, { driver_tag: 'tagA' })], []);
		expect(result[0].elapsed_ms).toBeNull();
		expect(result[0].dnf).toBe(false);
	});

	it('adds penalty_ms to elapsed_ms', () => {
		const result = buildStageTimes(
			[startRow(1, 1, 1000, { driver_tag: 'tagA' })],
			[finishRow(1, 'tagA', 5000, false, 10000)] // raw 4000ms + 10s penalty
		);
		expect(result[0].elapsed_ms).toBe(14000);
	});

	it('elapsed_ms is unaffected when penalty_ms is 0', () => {
		const result = buildStageTimes(
			[startRow(1, 1, 1000, { driver_tag: 'tagA' })],
			[finishRow(1, 'tagA', 5000, false, 0)]
		);
		expect(result[0].elapsed_ms).toBe(4000);
	});

	it('real finish takes precedence — dnf is false even if a dnf finish also exists', () => {
		// In practice close-stage skips drivers that already have a real finish,
		// but buildStageTimes should use the earliest valid finish regardless.
		const result = buildStageTimes(
			[startRow(1, 1, 1000, { driver_tag: 'tagA' })],
			[
				finishRow(1, 'tagA', 3000, false), // real RFID finish
				finishRow(1, 'tagA', 31000, true) // synthetic (should not be used)
			]
		);
		// calculateStageTime picks MIN valid finish → 3000
		expect(result[0].elapsed_ms).toBe(2000);
		expect(result[0].dnf).toBe(false);
	});
});
