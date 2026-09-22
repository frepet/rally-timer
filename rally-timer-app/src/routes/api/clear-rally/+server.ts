import { releaseEventGates } from '$lib/server/eventGates';
import { requireMutableEvent } from '$lib/server/eventContext';
import { json, type RequestEvent } from '@sveltejs/kit';
import { sql as db } from '../../../lib/server/db';
import { throwIfNotAdmin } from '../../../lib/server/keycloak';

export async function DELETE(event: RequestEvent): Promise<Response> {
	return db.begin(async (tx) => {
		const sql = tx as unknown as typeof db;
		await throwIfNotAdmin(event);
		const appEvent = await requireMutableEvent(event.url, 'rally', sql);
		{
			const tsql = sql;
			await releaseEventGates(tsql, appEvent.id);
			await tsql`DELETE FROM stages WHERE event_id = ${appEvent.id}`;
		}
		return json({ cleared: true });
	});
}
