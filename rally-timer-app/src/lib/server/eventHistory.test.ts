import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock('./db', () => ({ sql: m.sql }));
import { fetchTrainingDriverInputs } from './trainingData';
import { fetchClosedHeatResults } from './rallycrossData';
describe('saved event timing after gate release', () => {
	beforeEach(() => vi.clearAllMocks());
	it('retains training passes after its gate is disconnected', async () => {
		m.sql.mockResolvedValue([
			{
				gate_event_id: 1,
				timestamp: '1000',
				tag: 'car',
				rssi: null,
				driver_id: 2,
				driver_name: 'Driver',
				class_id: 3,
				class_name: 'A'
			}
		]);
		const result = await fetchTrainingDriverInputs(
			{ gate_id: null, cooldown_ms: 100, started_at: 1 },
			42
		);
		expect(result[0].passes).toHaveLength(1);
		const query = m.sql.mock.calls[0];
		expect(query[0].join('')).toContain('gate_event_events');
		expect(query.slice(1)).toContain(42);
	});
	it('retains rallycross timed results after gate release', async () => {
		m.sql.mockImplementation(async (strings: TemplateStringsArray) => {
			const q = strings.join('');
			if (q.includes('FROM rallycross_heats'))
				return [{ id: 1, number: 1, required_laps: 1, started_at: 1000, closed_at: 4000 }];
			if (q.includes('FROM rallycross_heat_entries'))
				return [
					{
						driver_id: 2,
						driver_name: 'Driver',
						class_id: 3,
						class_name: 'A',
						driver_uuid: 'person',
						tag: 'car',
						ts_ms: 1000,
						dnf: false,
						dnf_time_ms: null,
						manual_position: null
					}
				];
			return [{ tag: 'car', timestamp: 2000 }];
		});
		const result = await fetchClosedHeatResults({ gate_id: null, cooldown_ms: 100 }, 42);
		expect(result[0].finished).toBe(true);
		const passes = m.sql.mock.calls.find((c) => c[0].join('').includes('FROM gate_events'));
		expect(passes![0].join('')).toContain('gate_event_events');
		expect(passes!.slice(1)).toContain(42);
	});
});
