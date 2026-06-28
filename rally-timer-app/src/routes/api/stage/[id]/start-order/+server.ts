import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { loadStartOrder } from '../../../../../lib/server/startOrderQuery';

export async function GET(event: RequestEvent): Promise<Response> {
	const id = Number(event.params.id);
	if (!Number.isInteger(id) || id <= 0) throw error(400, 'Invalid id');

	return json(await loadStartOrder(id));
}
