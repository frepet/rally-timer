import { json, type RequestEvent } from '@sveltejs/kit';
import { db } from '../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../lib/server/keycloak';

export async function DELETE(event: RequestEvent): Promise<Response> {
  await throwIfNotAdmin(event);
  const id = Number(event.params.id);

  const result = db
    .prepare("DELETE FROM gate_events WHERE id = ?;")
    .run(id);

  return json({ deleted: result.changes });
}
