import { json, type RequestEvent } from "@sveltejs/kit";
import { db } from "../../../../lib/server/db";

export async function DELETE(event: RequestEvent): Promise<Response> {
  let result = db.prepare("DELETE FROM gate_events WHERE id = ?;").run(event.params.id);
  return json(result);
}

export async function PATCH({ params, request }: RequestEvent) {
  const id = Number(params.id);
  const body = await request.json();
  const ts = Number(body?.timestamp);
  if (!Number.isFinite(ts)) return json({ error: 'timestamp (ms) required' }, { status: 400 });
  const row = db.prepare(`UPDATE gate_events SET timestamp = ? WHERE id = ? RETURNING id, stage_id, timestamp`).get(ts, id);
  return json(row ?? { error: 'Not found' }, { status: row ? 200 : 404 });
}
