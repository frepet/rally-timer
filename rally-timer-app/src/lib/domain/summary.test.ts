import { describe, it, expect } from 'vitest';
import { buildStageData, buildRallyRows } from './summary';

// Minimal fixture helpers
const driver = (
	id: number,
	name: string,
	class_name: string,
	rfid_tag: string | null = `tag${id}`
) => ({ id, uuid: `uuid-${id}`, name, class_name, rfid_tag });

const stage = (id: number, name = `SS${id}`) => ({ id, name, is_closed: false });
const start = (driver_id: number, stage_id: number, ts: number) => ({ driver_id, stage_id, ts });
const finish = (stage_id: number, tag: string, ts: number, dnf = false, penalty_ms = 0) => ({
	stage_id,
	tag,
	ts,
	dnf,
	penalty_ms
});

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
				status: 'closed' as const,
				rows: [
					{
						driver_uuid: 'uuid-alice',
						driver_name: 'Alice',
						class_name: 'A',
						stage_ms: 4000,
						penalty_ms: 0,
						position: 1,
						delta_p1: 0,
						delta_prev: null,
						dnf: false,
						synthetic: false
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
				status: 'closed' as const,
				rows: [
					{
						driver_uuid: 'uuid-alice',
						driver_name: 'Alice',
						class_name: 'A',
						stage_ms: 4000,
						penalty_ms: 0,
						position: 1,
						delta_p1: 0,
						delta_prev: null,
						dnf: false,
						synthetic: false
					}
				]
			},
			{
				name: 'SS2',
				status: 'closed' as const,
				rows: [
					{
						driver_uuid: 'uuid-alice',
						driver_name: 'Alice',
						class_name: 'A',
						stage_ms: 7000,
						penalty_ms: 0,
						position: 1,
						delta_p1: 0,
						delta_prev: null,
						dnf: false,
						synthetic: false
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
				status: 'closed' as const,
				rows: [
					{
						driver_uuid: 'uuid-alice',
						driver_name: 'Alice',
						class_name: 'A',
						stage_ms: 4000,
						penalty_ms: 0,
						position: 1,
						delta_p1: 0,
						delta_prev: null,
						dnf: false,
						synthetic: false
					},
					{
						driver_uuid: 'uuid-bob',
						driver_name: 'Bob',
						class_name: 'A',
						stage_ms: 5000,
						penalty_ms: 0,
						position: 2,
						delta_p1: 1000,
						delta_prev: 1000,
						dnf: false,
						synthetic: false
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

	it('driver with more stages ranks above driver with fewer stages even if total time is slower', () => {
		// Alice: SS1=10000, SS2=10000 → total=20000, 2 stages
		// Bob: SS1=5000 → total=5000, 1 stage
		// Alice should rank P1 despite slower time because she has more stages
		const stageData = [
			{
				name: 'SS1',
				status: 'closed' as const,
				rows: [
					{
						driver_uuid: 'uuid-alice',
						driver_name: 'Alice',
						class_name: 'A',
						stage_ms: 10000,
						penalty_ms: 0,
						position: 1,
						delta_p1: 0,
						delta_prev: null,
						dnf: false,
						synthetic: false
					},
					{
						driver_uuid: 'uuid-bob',
						driver_name: 'Bob',
						class_name: 'A',
						stage_ms: 5000,
						penalty_ms: 0,
						position: 1,
						delta_p1: 0,
						delta_prev: null,
						dnf: false,
						synthetic: false
					}
				]
			},
			{
				name: 'SS2',
				status: 'closed' as const,
				rows: [
					{
						driver_uuid: 'uuid-alice',
						driver_name: 'Alice',
						class_name: 'A',
						stage_ms: 10000,
						penalty_ms: 0,
						position: 1,
						delta_p1: 0,
						delta_prev: null,
						dnf: false,
						synthetic: false
					}
				]
			}
		];
		const rows = buildRallyRows(stageData);
		expect(rows[0].driver_name).toBe('Alice');
		expect(rows[0].position).toBe(1);
		expect(rows[0].finished_stages).toBe(2);
		expect(rows[1].driver_name).toBe('Bob');
		expect(rows[1].position).toBe(2);
		expect(rows[1].finished_stages).toBe(1);
	});

	it('driver with more finished stages and faster total wins on both criteria', () => {
		// Diana: SS1=4000, SS2=3000 → total=7000, 2 stages
		// Bob: SS1=8000 → total=8000, 1 stage
		const stageData = [
			{
				name: 'SS1',
				status: 'closed' as const,
				rows: [
					{
						driver_uuid: 'uuid-diana',
						driver_name: 'Diana',
						class_name: 'A',
						stage_ms: 4000,
						penalty_ms: 0,
						position: 1,
						delta_p1: 0,
						delta_prev: null,
						dnf: false,
						synthetic: false
					},
					{
						driver_uuid: 'uuid-bob',
						driver_name: 'Bob',
						class_name: 'A',
						stage_ms: 8000,
						penalty_ms: 0,
						position: 2,
						delta_p1: 4000,
						delta_prev: 4000,
						dnf: false,
						synthetic: false
					}
				]
			},
			{
				name: 'SS2',
				status: 'closed' as const,
				rows: [
					{
						driver_uuid: 'uuid-diana',
						driver_name: 'Diana',
						class_name: 'A',
						stage_ms: 3000,
						penalty_ms: 0,
						position: 1,
						delta_p1: 0,
						delta_prev: null,
						dnf: false,
						synthetic: false
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

describe('buildStageData — status', () => {
	it('stage with no starts is upcoming', () => {
		const result = buildStageData([driver(1, 'Alice', 'A', 'tagA')], [stage(1)], [], []);
		expect(result[0].status).toBe('upcoming');
	});

	it('stage with a start event but not closed is live', () => {
		const result = buildStageData(
			[driver(1, 'Alice', 'A', 'tagA')],
			[stage(1)],
			[start(1, 1, 1000)],
			[]
		);
		expect(result[0].status).toBe('live');
	});

	it('stage with is_closed=true is closed regardless of starts', () => {
		const result = buildStageData(
			[driver(1, 'Alice', 'A', 'tagA')],
			[{ id: 1, name: 'SS1', is_closed: true }],
			[start(1, 1, 1000)],
			[finish(1, 'tagA', 5000)]
		);
		expect(result[0].status).toBe('closed');
	});

	it('stage with no starts and is_closed=true is closed', () => {
		const result = buildStageData([], [{ id: 1, name: 'SS1', is_closed: true }], [], []);
		expect(result[0].status).toBe('closed');
	});
});

describe('buildStageData — penalties', () => {
	it('adds penalty_ms to stage elapsed time', () => {
		const result = buildStageData(
			[driver(1, 'Alice', 'A', 'tagA')],
			[stage(1)],
			[start(1, 1, 1000)],
			[finish(1, 'tagA', 5000, false, 10000)] // raw 4000ms + 10s penalty
		);
		expect(result[0].rows[0].stage_ms).toBe(14000);
		expect(result[0].rows[0].penalty_ms).toBe(10000);
	});

	it('has penalty_ms 0 when no penalty is set', () => {
		const result = buildStageData(
			[driver(1, 'Alice', 'A', 'tagA')],
			[stage(1)],
			[start(1, 1, 1000)],
			[finish(1, 'tagA', 5000)]
		);
		expect(result[0].rows[0].penalty_ms).toBe(0);
	});

	it('penalty affects ordering when it makes a driver slower than another', () => {
		// Alice raw 4000ms + 5000ms penalty = 9000ms effective
		// Bob raw 7000ms, no penalty → Bob wins
		const result = buildStageData(
			[driver(1, 'Alice', 'A', 'tagA'), driver(2, 'Bob', 'A', 'tagB')],
			[stage(1)],
			[start(1, 1, 1000), start(2, 1, 1000)],
			[finish(1, 'tagA', 5000, false, 5000), finish(1, 'tagB', 8000)]
		);
		const rows = result[0].rows;
		expect(rows[0].driver_name).toBe('Bob');
		expect(rows[0].position).toBe(1);
		expect(rows[1].driver_name).toBe('Alice');
		expect(rows[1].position).toBe(2);
		expect(rows[1].penalty_ms).toBe(5000);
	});
});

describe('buildRallyRows — penalties', () => {
	it('sums penalty_ms across stages', () => {
		const stageData = buildStageData(
			[driver(1, 'Alice', 'A', 'tagA')],
			[stage(1), stage(2)],
			[start(1, 1, 0), start(1, 2, 100000)],
			[
				finish(1, 'tagA', 60000, false, 5000), // SS1: 60s raw + 5s penalty
				finish(2, 'tagA', 160000, false, 10000) // SS2: 60s raw + 10s penalty
			]
		);
		const rows = buildRallyRows(stageData);
		expect(rows[0].penalty_ms).toBe(15000);
	});

	it('penalty_ms is 0 when no penalties exist', () => {
		const stageData = buildStageData(
			[driver(1, 'Alice', 'A', 'tagA')],
			[stage(1)],
			[start(1, 1, 0)],
			[finish(1, 'tagA', 60000)]
		);
		const rows = buildRallyRows(stageData);
		expect(rows[0].penalty_ms).toBe(0);
	});
});

describe('buildStageData — DNF handling', () => {
	it('DNF driver with a synthetic finish event appears in the stage with dnf: true', () => {
		const result = buildStageData(
			[driver(1, 'Alice', 'A', 'tagA'), driver(2, 'Bob', 'A', 'tagB')],
			[stage(1)],
			[start(1, 1, 1000), start(2, 1, 1000)],
			[
				finish(1, 'tagA', 5000, false), // real finish
				finish(1, 'tagB', 37000, true) // synthetic DNF finish (1000 + 4000 + 30000 + some)
			]
		);
		const rows = result[0].rows;
		expect(rows).toHaveLength(2);
		expect(rows.find((r) => r.driver_name === 'Alice')!.dnf).toBe(false);
		expect(rows.find((r) => r.driver_name === 'Bob')!.dnf).toBe(true);
	});

	it('DNF driver is ranked naturally after finishers (no special case needed)', () => {
		// Alice: 4 s, Bob (DNF): 36 s — Bob is P2 with delta to Alice computed normally
		const result = buildStageData(
			[driver(1, 'Alice', 'A', 'tagA'), driver(2, 'Bob', 'A', 'tagB')],
			[stage(1)],
			[start(1, 1, 1000), start(2, 1, 1000)],
			[
				finish(1, 'tagA', 5000, false), // Alice: 4000 ms
				finish(1, 'tagB', 37000, true) // Bob DNF penalty: 36000 ms
			]
		);
		const rows = result[0].rows;
		expect(rows[0].driver_name).toBe('Alice');
		expect(rows[0].position).toBe(1);
		expect(rows[0].delta_p1).toBe(0);
		expect(rows[1].driver_name).toBe('Bob');
		expect(rows[1].position).toBe(2);
		expect(rows[1].delta_p1).toBe(32000); // 36000 - 4000
		expect(rows[1].delta_prev).toBe(32000);
	});

	it('DNF driver is included in rally total via buildRallyRows', () => {
		const stageData = buildStageData(
			[driver(1, 'Alice', 'A', 'tagA'), driver(2, 'Bob', 'A', 'tagB')],
			[stage(1)],
			[start(1, 1, 1000), start(2, 1, 1000)],
			[
				finish(1, 'tagA', 5000, false), // Alice: 4000 ms
				finish(1, 'tagB', 37000, true) // Bob DNF: 36000 ms
			]
		);
		const rows = buildRallyRows(stageData);
		expect(rows).toHaveLength(2);
		expect(rows[0].driver_name).toBe('Alice');
		expect(rows[0].total_ms).toBe(4000);
		expect(rows[1].driver_name).toBe('Bob');
		expect(rows[1].total_ms).toBe(36000);
		expect(rows[1].dnf).toBe(true);
	});

	it('penalized DNF stages count toward finished_stages and are tallied in dnf_count', () => {
		// 2 stages: Alice finishes both, Bob finishes SS1 and DNFs SS2 with a penalty time
		const stageData = buildStageData(
			[driver(1, 'Alice', 'A', 'tagA'), driver(2, 'Bob', 'A', 'tagB')],
			[stage(1), stage(2)],
			[start(1, 1, 1000), start(2, 1, 1000), start(1, 2, 50000), start(2, 2, 50000)],
			[
				finish(1, 'tagA', 5000, false), // Alice SS1: 4000ms
				finish(1, 'tagB', 7000, false), // Bob SS1: 6000ms
				finish(2, 'tagA', 54000, false), // Alice SS2: 4000ms
				finish(2, 'tagB', 86000, true) // Bob SS2 DNF penalty: 36000ms
			]
		);
		const rows = buildRallyRows(stageData);
		const alice = rows.find((r) => r.driver_name === 'Alice')!;
		const bob = rows.find((r) => r.driver_name === 'Bob')!;
		expect(alice.finished_stages).toBe(2);
		expect(alice.dnf_count).toBe(0);
		expect(bob.finished_stages).toBe(2); // SS2 DNF has a penalty time — still a completed stage
		expect(bob.dnf_count).toBe(1);
		expect(bob.dnf).toBe(true);
	});

	it('DNF driver with a lower penalized total ranks above a clean driver with equal stages', () => {
		// Alice: SS1=10000, SS2=10000 → total 20000, clean
		// Bob: SS1=4000, SS2 DNF penalty=12000 → total 16000 — the +30s-style penalty is
		// already in his total, so he outranks Alice on time despite the DNF.
		const stageData = buildStageData(
			[driver(1, 'Alice', 'A', 'tagA'), driver(2, 'Bob', 'A', 'tagB')],
			[stage(1), stage(2)],
			[start(1, 1, 0), start(2, 1, 0), start(1, 2, 50000), start(2, 2, 50000)],
			[
				finish(1, 'tagA', 10000, false),
				finish(1, 'tagB', 4000, false),
				finish(2, 'tagA', 60000, false),
				finish(2, 'tagB', 62000, true) // synthetic DNF finish → 12000ms
			]
		);
		const rows = buildRallyRows(stageData);
		expect(rows[0].driver_name).toBe('Bob');
		expect(rows[0].position).toBe(1);
		expect(rows[0].dnf).toBe(true);
		expect(rows[1].driver_name).toBe('Alice');
		expect(rows[1].position).toBe(2);
	});
});
