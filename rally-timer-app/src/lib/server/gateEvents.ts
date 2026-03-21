type Listener = (data: { gate_id: string; tag: string }) => void;

const listeners = new Set<Listener>();

export function emitGateEvent(data: { gate_id: string; tag: string }) {
	listeners.forEach((listener) => {
		try {
			listener({ gate_id: data.gate_id, tag: data.tag });
		} catch {
			listeners.delete(listener);
		}
	});
}

export function addGateEventListener(listener: Listener) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}
