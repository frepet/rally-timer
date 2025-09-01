import { json, type RequestEvent } from "@sveltejs/kit";
import { db } from "../../../../lib/server/db";

export async function GET(event: RequestEvent) {
  const tag = event.params.id?.trim() ?? '';
  if (!tag) return json({ error: 'Missing tag' }, { status: 400 });

  const row = db
    .prepare('SELECT id, name, tag FROM drivers WHERE tag = ? COLLATE NOCASE')
    .get(tag); // get one row, not .all()

  return json({ driver: row ?? null }); // always { driver: ... }
}

export async function DELETE(event: RequestEvent): Promise<Response> {
  const id = Number(event.params.id);
  const res = db.prepare("DELETE FROM drivers WHERE id = ?;").run(id);
  if (res.changes === 0) return new Response(null, { status: 404 });
  return new Response(null, { status: 204 });
}
