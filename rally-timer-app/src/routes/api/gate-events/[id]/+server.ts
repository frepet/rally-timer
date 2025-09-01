import { json, type RequestEvent } from '@sveltejs/kit';
import { db } from '../../../../lib/server/db';

export async function DELETE(event: RequestEvent): Promise<Response> {
  const id = Number(event.params.id);

  const result = db
    .prepare("DELETE FROM gate_events WHERE id = ?;")
    .run(id);

  return json({ deleted: result.changes });
}
