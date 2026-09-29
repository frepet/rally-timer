import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const championshipId = '5e245b8a-62c2-4b94-adad-806b1cd5cd15';
const m = vi.hoisted(() => ({ queries: [] as string[], locked: false }));

vi.mock('./db', () => {
	const sql = Object.assign(
		async (strings: TemplateStringsArray) => {
			const query = strings.join('?');
			m.queries.push(query);
			if (query.includes('FROM events')) {
				return [
					{ id: 42, type: 'training', name: 'Monday practice', created_at: 1, is_locked: m.locked }
				];
			}
			if (query.includes('SELECT gate_id, cooldown_ms')) {
				return [{ gate_id: null, cooldown_ms: 100, started_at: 1 }];
			}
			if (query.includes('FROM gate_events')) {
				return [
					{
						gate_event_id: 1,
						timestamp: '1000',
						tag: 'car',
						rssi: -40,
						driver_id: 7,
						driver_name: 'Driver',
						class_id: 2,
						class_name: 'A'
					},
					{
						gate_event_id: 2,
						timestamp: '3000',
						tag: 'car',
						rssi: -41,
						driver_id: 7,
						driver_name: 'Driver',
						class_id: 2,
						class_name: 'A'
					}
				];
			}
			if (query.includes('FROM championships')) return [{ id: championshipId }];
			if (query.includes('INSERT INTO submitted_rallies')) return [{ id: 'snapshot' }];
			if (query.includes('UPDATE events')) m.locked = true;
			return [];
		},
		{
			json: (value: unknown) => value,
			begin: async (fn: (tx: unknown) => unknown) => fn(sql)
		}
	);
	return { sql };
});
vi.mock('./keycloak', () => ({ throwIfNotAdmin: vi.fn() }));

import { POST } from '../../routes/api/submit-training/+server';

function request(): RequestEvent {
	return {
		url: new URL('http://localhost/api/submit-training?event_id=42'),
		request: new Request('http://localhost', {
			method: 'POST',
			body: JSON.stringify({ championship_ids: [championshipId] })
		})
	} as RequestEvent;
}

describe('training submission', () => {
	beforeEach(() => {
		m.queries = [];
		m.locked = false;
	});

	it('snapshots laps, attaches the practice, and locks without ratings', async () => {
		const response = await POST(request());
		expect(response.status).toBe(201);
		expect(
			m.queries.some((query) => query.includes('INSERT INTO submitted_training_results'))
		).toBe(true);
		expect(m.queries.some((query) => query.includes('INSERT INTO championship_rallies'))).toBe(
			true
		);
		expect(m.queries.some((query) => query.includes('rally_driver_ratings'))).toBe(false);
		expect(m.locked).toBe(true);
	});
});
