import { sql } from './db';

type Listener = (data: { gate_id: string; tag: string }) => void;

const listeners = new Set<Listener>();

// One persistent PG LISTEN per pod — routes notifications to all local SSE clients
sql.listen('gate_events', (payload) => {
	try {
		const data = JSON.parse(payload) as { gate_id: string; tag: string };
		listeners.forEach((listener) => {
			try {
				listener(data);
			} catch {
				listeners.delete(listener);
			}
		});
	} catch {
		/* ignore malformed payload */
	}
});

export async function emitGateEvent(data: { gate_id: string; tag: string }) {
	await sql.notify('gate_events', JSON.stringify(data));
}

export function addGateEventListener(listener: Listener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}
