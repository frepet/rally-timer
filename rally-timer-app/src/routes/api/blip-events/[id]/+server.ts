import Database from 'better-sqlite3';
import type { RequestEvent } from './$types';
import { json } from '@sveltejs/kit';

const db = new Database('database.sqlite', { fileMustExist: true });

export async function DELETE(event: RequestEvent): Promise<Response> {
  const id = Number(event.params.id);

  const result = db
    .prepare("DELETE FROM blip_events WHERE id = ?;")
    .run(id);

  return json({ deleted: result.changes });
}
