import { json, type RequestEvent } from "@sveltejs/kit";
import Database from "better-sqlite3";

const db = new Database('database.sqlite', { fileMustExist: true });

export async function DELETE(event: RequestEvent): Promise<Response> {
  let result = db.prepare("DELETE FROM blip_events WHERE id = ?;").run(event.params.id);
  return json(result);
}

export async function PATCH({ params, request }: RequestEvent) {
  const id = Number(params.id);
  const body = await request.json();
  const ts = Number(body?.timestamp);
  if (!Number.isFinite(ts)) return json({ error: 'timestamp (ms) required' }, { status: 400 });
  const row = db.prepare(`UPDATE blip_events SET timestamp = ? WHERE id = ? RETURNING id, stage_id, timestamp, tag`).get(ts, id);
  return json(row ?? { error: 'Not found' }, { status: row ? 200 : 404 });
}
