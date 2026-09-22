import type { RequestHandler } from '@sveltejs/kit';
import { requireEvent } from '$lib/server/eventContext';
import { addGateEventListener } from '../../../../lib/server/gateEvents';

export const GET: RequestHandler = async ({ url }) => {
	const eventId = url.searchParams.has('event_id') ? (await requireEvent(url)).id : null;
	const encoder = new TextEncoder();
	let unsubscribe: (() => void) | null = null;

	const stream = new ReadableStream({
		start(controller) {
			unsubscribe = addGateEventListener((data) => {
				if (eventId !== null && data.event_id !== eventId) return;
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
