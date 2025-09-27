import { json, type RequestEvent } from '@sveltejs/kit';
import { NewFinishEvent } from '../../../../../lib/types';
import { db } from '../../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../../lib/server/keycloak';

export async function POST(event: RequestEvent): Promise<Response> {
	await throwIfNotAdmin(event);
	const newFinishEvent = NewFinishEvent.parse(await event.request.json());

	db.pragma('journal_mode = WAL');
	const result = db
		.prepare('INSERT INTO finish_events(stage_id, timestamp, tag) VALUES(?,?,?) returning *;')
		.get(event.params.id, newFinishEvent.timestamp, newFinishEvent.tag);

	return json(result);
}
