import { sql } from '../../../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../../../lib/server/keycloak';

export async function DELETE(event) {
	await throwIfNotAdmin(event);
	const rallyId = Number(event.params.id);
	const driverId = Number(event.params.driverId);
	const result = await sql`
		DELETE FROM rally_drivers WHERE rally_id = ${rallyId} AND driver_id = ${driverId}
	`;
	if (result.count === 0) return new Response(null, { status: 404 });
	return new Response(null, { status: 204 });
}
