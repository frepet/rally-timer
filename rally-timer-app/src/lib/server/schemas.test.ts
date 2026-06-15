import { describe, it, expect } from 'vitest';

import { gateSyncSchema, idParam } from './schemas';

const UUID = '11111111-2222-4333-8444-555555555555';

function makeEvents(n: number) {
	return Array.from({ length: n }, (_, i) => ({
		gate_id: UUID,
		timestamp_ms: 1000 + i,
		tag: `T${i}`
	}));
}

describe('gateSyncSchema', () => {
	it('accepts a reasonable batch', () => {
		expect(gateSyncSchema.safeParse({ events: makeEvents(50) }).success).toBe(true);
	});

	it('rejects an oversized batch (DoS guard)', () => {
		// An unbounded events array lets an unauthenticated client flood the DB
		// and every SSE client in one request.
		expect(gateSyncSchema.safeParse({ events: makeEvents(5000) }).success).toBe(false);
	});
});

describe('idParam', () => {
	it('rejects zero and negatives', () => {
		expect(idParam.safeParse(0).success).toBe(false);
		expect(idParam.safeParse(-1).success).toBe(false);
		expect(idParam.safeParse('0').success).toBe(false);
	});

	it('accepts positive integers from string or number', () => {
		expect(idParam.parse('42')).toBe(42);
		expect(idParam.parse(7)).toBe(7);
	});
});
