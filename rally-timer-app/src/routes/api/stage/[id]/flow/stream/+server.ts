import { error, type RequestHandler } from '@sveltejs/kit';
import { addStageFlowListener } from '../../../../../../lib/server/stageFlow';

export const GET: RequestHandler = ({ params }) => {
	const stageId = Number(params.id);
	if (!Number.isInteger(stageId) || stageId <= 0) throw error(400, 'Invalid id');

	const encoder = new TextEncoder();
	let unsubscribe: (() => void) | null = null;

	const stream = new ReadableStream({
		start(controller) {
			unsubscribe = addStageFlowListener((data) => {
				if (data.stage_id !== stageId) return;
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
