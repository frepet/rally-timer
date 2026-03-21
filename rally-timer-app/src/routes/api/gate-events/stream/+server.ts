import type { RequestHandler } from '@sveltejs/kit';
import { addGateEventListener } from '../../../../lib/server/gateEvents';

export const GET: RequestHandler = () => {
	const encoder = new TextEncoder();
	let unsubscribe: (() => void) | null = null;

	const stream = new ReadableStream({
		start(controller) {
			unsubscribe = addGateEventListener((data) => {
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
				} catch {
					// Client disconnected
				}
			});

			controller.enqueue(encoder.encode(': connected\n\n'));

			const ping = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(': ping\n\n'));
				} catch {
					clearInterval(ping);
				}
			}, 15000);
		},
		cancel() {
			if (unsubscribe) unsubscribe();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};
