import { describe, it, expect } from 'vitest';
import { computeRallyRatings } from './ratings';
import type { StageData } from '../results';

const BASE = 1500;

function makeStage(
	name: string,
	rows: Array<{
		uuid: string;
		driverName: string;
		className: string;
		stage_ms: number;
		dnf?: boolean;
	}>
): StageData {
	return {
		name,
		status: 'closed',
		rows: rows.map((r) => ({
			driver_uuid: r.uuid,
			driver_name: r.driverName,
			class_name: r.className,
			stage_ms: r.stage_ms,
			penalty_ms: 0,
			delta_p1: null,
			delta_prev: null,
			position: 0,
			dnf: r.dnf ?? false,
			synthetic: false
		}))
	};
}

describe('computeRallyRatings', () => {
	it('returns empty maps for no stages', () => {
		const { finalRatings, stageDeltas } = computeRallyRatings([]);
		expect(finalRatings.size).toBe(0);
		expect(stageDeltas.size).toBe(0);
	});

	it('skips stages with fewer than 2 drivers in a class', () => {
		const stages = [
			makeStage('SS1', [{ uuid: 'a', driverName: 'Alice', className: 'A', stage_ms: 5000 }])
		];
		const { finalRatings } = computeRallyRatings(stages);
		expect(finalRatings.get('a')).toBe(BASE);
	});

	it('winner gains rating, loser loses', () => {
		const stages = [
			makeStage('SS1', [
				{ uuid: 'a', driverName: 'Alice', className: 'A', stage_ms: 5000 },
				{ uuid: 'b', driverName: 'Bob', className: 'A', stage_ms: 8000 }
			])
		];
		const { finalRatings } = computeRallyRatings(stages);
		expect(finalRatings.get('a')).toBeGreaterThan(BASE);
		expect(finalRatings.get('b')).toBeLessThan(BASE);
	});

	it('ratings are keyed by driver_uuid, not driver_name', () => {
		const stages = [
			makeStage('SS1', [
				{ uuid: 'uuid-a', driverName: 'Alice', className: 'A', stage_ms: 5000 },
				{ uuid: 'uuid-b', driverName: 'Bob', className: 'A', stage_ms: 8000 }
			])
		];
		const { finalRatings } = computeRallyRatings(stages);
		expect(finalRatings.has('uuid-a')).toBe(true);
		expect(finalRatings.has('uuid-b')).toBe(true);
		expect(finalRatings.has('Alice')).toBe(false);
		expect(finalRatings.has('Bob')).toBe(false);
	});

	it('uses initial rating keyed by UUID even when driver name changed', () => {
		// Driver renamed from "Alice" to "Alicia" between rallies.
		// Her UUID is 'uuid-a' and she previously earned 1600.
		const initialRatings = new Map([['uuid-a', 1600]]);
		const stages = [
			makeStage('SS1', [
				{ uuid: 'uuid-a', driverName: 'Alicia', className: 'A', stage_ms: 5000 },
				{ uuid: 'uuid-b', driverName: 'Bob', className: 'A', stage_ms: 8000 }
			])
		];
		const { finalRatings } = computeRallyRatings(stages, initialRatings);
		// Alicia (uuid-a) wins from a starting rating of 1600, should end above 1600
		expect(finalRatings.get('uuid-a')).toBeGreaterThan(1600);
	});

	it('two drivers with the same name but different UUIDs are tracked separately', () => {
		const stages = [
			makeStage('SS1', [
				{ uuid: 'uuid-1', driverName: 'Smith', className: 'A', stage_ms: 5000 },
				{ uuid: 'uuid-2', driverName: 'Smith', className: 'A', stage_ms: 8000 }
			])
		];
		const { finalRatings } = computeRallyRatings(stages);
		expect(finalRatings.size).toBe(2);
		expect(finalRatings.get('uuid-1')).toBeGreaterThan(BASE);
		expect(finalRatings.get('uuid-2')).toBeLessThan(BASE);
	});

	it('drivers in different classes do not affect each other', () => {
		const stages = [
			makeStage('SS1', [
				{ uuid: 'a', driverName: 'Alice', className: 'A', stage_ms: 5000 },
				{ uuid: 'b', driverName: 'Bob', className: 'B', stage_ms: 8000 }
			])
		];
		const { finalRatings } = computeRallyRatings(stages);
		expect(finalRatings.get('a')).toBe(BASE);
		expect(finalRatings.get('b')).toBe(BASE);
	});

	it('DNF driver gets no rating change, and finisher gets no free points from the DNF', () => {
		const stages = [
			makeStage('SS1', [
				{ uuid: 'a', driverName: 'Alice', className: 'A', stage_ms: 5000 },
				{ uuid: 'b', driverName: 'Bob', className: 'A', stage_ms: 9999999, dnf: true }
			])
		];
		const { finalRatings } = computeRallyRatings(stages);
		expect(finalRatings.get('a')).toBe(BASE);
		expect(finalRatings.get('b')).toBe(BASE);
	});

	it('both DNFs result in no rating change', () => {
		const stages = [
			makeStage('SS1', [
				{ uuid: 'a', driverName: 'Alice', className: 'A', stage_ms: 9999999, dnf: true },
				{ uuid: 'b', driverName: 'Bob', className: 'A', stage_ms: 9999999, dnf: true }
			])
		];
		const { finalRatings } = computeRallyRatings(stages);
		expect(finalRatings.get('a')).toBe(BASE);
		expect(finalRatings.get('b')).toBe(BASE);
	});

	it('driver who DNFs one stage still earns rating on stages they completed', () => {
		// Alice completes both stages. Bob completes SS1 but DNFs SS2.
		// SS1: Alice vs Bob — both finish, normal Elo applies.
		// SS2: Bob DNFs — neither driver gets rating change from that stage.
		const ss1 = makeStage('SS1', [
			{ uuid: 'a', driverName: 'Alice', className: 'A', stage_ms: 5000 },
			{ uuid: 'b', driverName: 'Bob', className: 'A', stage_ms: 8000 }
		]);
		const ss2 = makeStage('SS2', [
			{ uuid: 'a', driverName: 'Alice', className: 'A', stage_ms: 5000 },
			{ uuid: 'b', driverName: 'Bob', className: 'A', stage_ms: 9999999, dnf: true }
		]);
		const { finalRatings, stageDeltas } = computeRallyRatings([ss1, ss2]);
		// Alice wins SS1, so she should be above BASE
		expect(finalRatings.get('a')).toBeGreaterThan(BASE);
		// Bob loses SS1 but SS2 DNF gives him nothing — he should be below BASE
		expect(finalRatings.get('b')).toBeLessThan(BASE);
		// SS2 should produce zero deltas since Bob DNFs
		const ss2Deltas = stageDeltas.get('SS2')!;
		expect(ss2Deltas.get('a')).toBe(0);
		expect(ss2Deltas.get('b')).toBe(0);
	});

	it('ratings carry over between stages within a rally', () => {
		const ss1 = makeStage('SS1', [
			{ uuid: 'a', driverName: 'Alice', className: 'A', stage_ms: 5000 },
			{ uuid: 'b', driverName: 'Bob', className: 'A', stage_ms: 8000 }
		]);
		const ss2 = makeStage('SS2', [
			{ uuid: 'a', driverName: 'Alice', className: 'A', stage_ms: 5000 },
			{ uuid: 'b', driverName: 'Bob', className: 'A', stage_ms: 8000 }
		]);
		const { finalRatings: afterOne } = computeRallyRatings([ss1]);
		const { finalRatings: afterTwo } = computeRallyRatings([ss1, ss2]);
		expect(afterTwo.get('a')!).toBeGreaterThan(afterOne.get('a')!);
		expect(afterTwo.get('b')!).toBeLessThan(afterOne.get('b')!);
	});

	it('stageDeltas are keyed by driver_uuid', () => {
		const stages = [
			makeStage('SS1', [
				{ uuid: 'uuid-a', driverName: 'Alice', className: 'A', stage_ms: 5000 },
				{ uuid: 'uuid-b', driverName: 'Bob', className: 'A', stage_ms: 8000 }
			])
		];
		const { stageDeltas } = computeRallyRatings(stages);
		const ss1 = stageDeltas.get('SS1')!;
		expect(ss1.has('uuid-a')).toBe(true);
		expect(ss1.has('uuid-b')).toBe(true);
		expect(ss1.has('Alice')).toBe(false);
		expect(ss1.get('uuid-a')!).toBeGreaterThan(0);
		expect(ss1.get('uuid-b')!).toBeLessThan(0);
	});

	it('finalRatings are rounded integers', () => {
		const stages = [
			makeStage('SS1', [
				{ uuid: 'a', driverName: 'Alice', className: 'A', stage_ms: 5001 },
				{ uuid: 'b', driverName: 'Bob', className: 'A', stage_ms: 5002 }
			])
		];
		const { finalRatings } = computeRallyRatings(stages);
		for (const r of finalRatings.values()) expect(Number.isInteger(r)).toBe(true);
	});

	it('equal times leave equal-rated drivers unchanged', () => {
		const stages = [
			makeStage('SS1', [
				{ uuid: 'a', driverName: 'Alice', className: 'A', stage_ms: 5000 },
				{ uuid: 'b', driverName: 'Bob', className: 'A', stage_ms: 5000 }
			])
		];
		const { finalRatings } = computeRallyRatings(stages);
		expect(finalRatings.get('a')).toBe(BASE);
		expect(finalRatings.get('b')).toBe(BASE);
	});

	it('zero or negative stage times never produce NaN ratings', () => {
		const stages = [
			makeStage('SS1', [
				{ uuid: 'a', driverName: 'Alice', className: 'A', stage_ms: 0 },
				{ uuid: 'b', driverName: 'Bob', className: 'A', stage_ms: 0 },
				{ uuid: 'c', driverName: 'Carol', className: 'A', stage_ms: 5000 }
			])
		];
		const { finalRatings } = computeRallyRatings(stages);
		for (const r of finalRatings.values()) expect(Number.isFinite(r)).toBe(true);
	});

	it('close margin yields smaller delta than large margin', () => {
		const closeStage = makeStage('SS1', [
			{ uuid: 'a', driverName: 'Alice', className: 'A', stage_ms: 5000 },
			{ uuid: 'b', driverName: 'Bob', className: 'A', stage_ms: 5010 }
		]);
		const wideStage = makeStage('SS1', [
			{ uuid: 'a', driverName: 'Alice', className: 'A', stage_ms: 5000 },
			{ uuid: 'b', driverName: 'Bob', className: 'A', stage_ms: 9000 }
		]);
		const { finalRatings: close } = computeRallyRatings([closeStage]);
		const { finalRatings: wide } = computeRallyRatings([wideStage]);
		const closeDelta = close.get('a')! - BASE;
		const wideDelta = wide.get('a')! - BASE;
		expect(closeDelta).toBeLessThan(wideDelta);
	});
});
