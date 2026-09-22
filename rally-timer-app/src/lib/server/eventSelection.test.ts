import { describe, expect, it } from 'vitest';
import { assertEventSelection } from './eventSelection';
describe('nested event selection', () => {
	it('allows a shareable stage or heat URL without an event query', () =>
		expect(() => assertEventSelection(new URL('http://localhost/stage/1'), 42)).not.toThrow());
	it('allows matching event selection', () =>
		expect(() =>
			assertEventSelection(new URL('http://localhost/stage/1?event_id=42'), 42)
		).not.toThrow());
	it('rejects a conflicting event selection', () =>
		expect(() =>
			assertEventSelection(new URL('http://localhost/stage/1?event_id=7'), 42)
		).toThrow());
});
