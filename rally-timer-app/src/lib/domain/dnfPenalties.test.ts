import { describe, it, expect } from 'vitest';
import { applyDnfPenalties, dnfPenaltyMs, DNF_PENALTY_MS, DNF_FALLBACK_MS } from './dnfPenalties';
import type { StageTimeResult } from './rallySubmission';

describe('dnfPenaltyMs', () => {
	it('returns slowest + 30 s when at least one driver in the class finished', () => {
		expect(dnfPenaltyMs(8000)).toBe(8000 + DNF_PENALTY_MS);
	});

	it('returns the fallback when nobody in the class finished', () => {
		expect(dnfPenaltyMs(undefined)).toBe(DNF_FALLBACK_MS);
	});

	it('treats slowest = 0 ms as a valid finish (does not fall back)', () => {
		expect(dnfPenaltyMs(0)).toBe(DNF_PENALTY_MS);
	});
});

const result = (
	driver_name: string,
	elapsed_ms: number | null,
	opts: { class_id?: number; class_name?: string; stage_name?: string } = {}
): StageTimeResult => ({
	driver_id: 1,
	driver_uuid: `uuid-${driver_name}`,
	driver_name,
	class_id: opts.class_id ?? 1,
	class_name: opts.class_name ?? 'ClassA',
	stage_name: opts.stage_name ?? 'SS1',
	stage_order: 0,
	elapsed_ms,
	dnf: false
});

describe('applyDnfPenalties', () => {
	it('returns empty array unchanged', () => {
		expect(applyDnfPenalties([])).toEqual([]);
	});

	it('marks a finisher as dnf: false and preserves elapsed_ms', () => {
		const out = applyDnfPenalties([result('Alice', 4000)]);
		expect(out).toHaveLength(1);
		expect(out[0].dnf).toBe(false);
		expect(out[0].elapsed_ms).toBe(4000);
	});

	it('DNF driver gets slowest finisher in class + 30 s', () => {
		const out = applyDnfPenalties([
			result('Alice', 4000),
			result('Bob', 6000), // slowest
			result('Charlie', null) // DNF
		]);
		const charlie = out.find((r) => r.driver_name === 'Charlie')!;
		expect(charlie.dnf).toBe(true);
		expect(charlie.elapsed_ms).toBe(6000 + DNF_PENALTY_MS);
	});

	it('multiple DNF drivers in the same class all get the same penalty', () => {
		const out = applyDnfPenalties([
			result('Alice', 5000), // slowest finisher
			result('Bob', null), // DNF
			result('Charlie', null) // DNF
		]);
		const penalty = 5000 + DNF_PENALTY_MS;
		expect(out.find((r) => r.driver_name === 'Bob')!.elapsed_ms).toBe(penalty);
		expect(out.find((r) => r.driver_name === 'Charlie')!.elapsed_ms).toBe(penalty);
	});

	it('uses the fallback time when no finisher exists in the class', () => {
		const out = applyDnfPenalties([result('Alice', null)]);
		expect(out[0].dnf).toBe(true);
		expect(out[0].elapsed_ms).toBe(DNF_FALLBACK_MS);
	});

	it('classes are independent — each class uses its own slowest finisher', () => {
		const out = applyDnfPenalties([
			result('Alice', 4000, { class_id: 1, class_name: 'A' }),
			result('Bob', 9000, { class_id: 2, class_name: 'B' }),
			result('Charlie', null, { class_id: 1, class_name: 'A' }), // DNF in class A
			result('Diana', null, { class_id: 2, class_name: 'B' }) // DNF in class B
		]);
		expect(out.find((r) => r.driver_name === 'Charlie')!.elapsed_ms).toBe(4000 + DNF_PENALTY_MS);
		expect(out.find((r) => r.driver_name === 'Diana')!.elapsed_ms).toBe(9000 + DNF_PENALTY_MS);
	});

	it('stage names are independent — each stage uses its own slowest finisher', () => {
		const out = applyDnfPenalties([
			result('Alice', 4000, { stage_name: 'SS1' }),
			result('Alice', 7000, { stage_name: 'SS2' }),
			result('Bob', null, { stage_name: 'SS1' }), // DNF on SS1
			result('Bob', null, { stage_name: 'SS2' }) // DNF on SS2
		]);
		expect(out.find((r) => r.driver_name === 'Bob' && r.stage_name === 'SS1')!.elapsed_ms).toBe(
			4000 + DNF_PENALTY_MS
		);
		expect(out.find((r) => r.driver_name === 'Bob' && r.stage_name === 'SS2')!.elapsed_ms).toBe(
			7000 + DNF_PENALTY_MS
		);
	});

	it('order is preserved — finishers first in input, DNF drivers at end, unchanged ordering', () => {
		const out = applyDnfPenalties([
			result('Alice', 4000),
			result('Bob', 6000),
			result('Charlie', null)
		]);
		expect(out.map((r) => r.driver_name)).toEqual(['Alice', 'Bob', 'Charlie']);
	});

	it('DNF drivers with penalty sort naturally after finishers (no special delta logic needed)', () => {
		// penalty = 6000 + 30000 = 36000, larger than all finishers
		const out = applyDnfPenalties([
			result('Alice', 4000),
			result('Bob', 6000),
			result('Charlie', null)
		]);
		const times = out.map((r) => r.elapsed_ms as number);
		expect(times).toEqual([4000, 6000, 6000 + DNF_PENALTY_MS]);
		// When sorted ascending, Charlie is naturally last
		const sorted = [...times].sort((a, b) => a - b);
		expect(sorted[sorted.length - 1]).toBe(6000 + DNF_PENALTY_MS);
	});
});
