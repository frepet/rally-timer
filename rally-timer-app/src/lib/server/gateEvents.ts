import { sql } from './db';

export type GateEventPayload = {
	gate_id: string;
	tag: string;
	rssi: number | null;
	timestamp_ms: number;
};

type Listener = (data: GateEventPayload) => void;

const listeners = new Set<Listener>();
let listening = false;

// Lazily set up PG LISTEN — deferred until the first SSE client connects
// so it doesn't fire during the build step where no DB is available.
function ensureListening() {
	if (listening) return;
	listening = true;
	sql
		.listen('gate_events', (payload) => {
			try {
				const data = JSON.parse(payload) as GateEventPayload;
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
		})
		.catch((e) => {
			console.error('PG LISTEN gate_events failed:', e);
			listening = false;
		});
}

export async function emitGateEvent(data: GateEventPayload) {
	await sql.notify('gate_events', JSON.stringify(data));
}

export function addGateEventListener(listener: Listener): () => void {
	ensureListening();
	listeners.add(listener);
	return () => listeners.delete(listener);
}
