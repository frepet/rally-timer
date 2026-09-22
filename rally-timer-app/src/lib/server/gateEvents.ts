import { sql } from './db';

export type GateEventPayload = {
	event_id?: number | null;
	gate_id: string;
	tag: string;
	rssi: number | null;
	timestamp_ms: number;
};

type Listener = (data: GateEventPayload) => void;

const listeners = new Set<Listener>();
let listening = false;
let retryDelayMs = 1000;

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
		.then(() => {
			retryDelayMs = 1000;
		})
		.catch((e) => {
			console.error('PG LISTEN gate_events failed:', e);
			listening = false;
			// Connected SSE clients would otherwise silently stop receiving
			// events — keep retrying with backoff while anyone is listening.
			if (listeners.size > 0) {
				setTimeout(ensureListening, retryDelayMs);
				retryDelayMs = Math.min(retryDelayMs * 2, 30000);
			}
		});
}

export async function emitGateEvent(data: GateEventPayload) {
	const [owner] = await sql<
		{ event_id: number }[]
	>`SELECT gee.event_id FROM gate_event_events gee JOIN gate_events ge ON ge.id=gee.gate_event_id WHERE ge.gate_id=${data.gate_id} AND ge.tag=${data.tag} AND ge.timestamp=${data.timestamp_ms} ORDER BY gee.event_id LIMIT 1`;
	await sql.notify('gate_events', JSON.stringify({ ...data, event_id: owner?.event_id ?? null }));
}

export function addGateEventListener(listener: Listener): () => void {
	ensureListening();
	listeners.add(listener);
	return () => listeners.delete(listener);
}
