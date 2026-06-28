import { sql } from './db';

export type StageFlowPayload = {
	stage_id: number;
	action: 'start' | 'stop';
};

type Listener = (data: StageFlowPayload) => void;

const listeners = new Set<Listener>();
let listening = false;
let retryDelayMs = 1000;

// Lazily set up PG LISTEN — deferred until the first SSE client connects
// so it doesn't fire during the build step where no DB is available.
function ensureListening() {
	if (listening) return;
	listening = true;
	sql
		.listen('stage_flow', (payload) => {
			try {
				const data = JSON.parse(payload) as StageFlowPayload;
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
			console.error('PG LISTEN stage_flow failed:', e);
			listening = false;
			if (listeners.size > 0) {
				setTimeout(ensureListening, retryDelayMs);
				retryDelayMs = Math.min(retryDelayMs * 2, 30000);
			}
		});
}

export async function emitStageFlow(data: StageFlowPayload) {
	await sql.notify('stage_flow', JSON.stringify(data));
}

export function addStageFlowListener(listener: Listener): () => void {
	ensureListening();
	listeners.add(listener);
	return () => listeners.delete(listener);
}
