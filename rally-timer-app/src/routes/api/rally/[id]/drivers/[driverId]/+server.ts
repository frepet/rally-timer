import { db } from '../../../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../../../lib/server/keycloak';

export async function DELETE(event) {
	await throwIfNotAdmin(event);
	const rallyId = Number(event.params.id);
	const driverId = Number(event.params.driverId);
	db.pragma('journal_mode = WAL');
	const res = db
		.prepare(`DELETE FROM rally_drivers WHERE rally_id = ? AND driver_id = ?;`)
		.run(rallyId, driverId);
	if (res.changes === 0) return new Response(null, { status: 404 });
	return new Response(null, { status: 204 });
}
