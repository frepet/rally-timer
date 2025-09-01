import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { db } from '../../../../lib/server/db';

export async function PATCH({ params, request }: RequestEvent) {
  const id = Number(params.id);
  const body = await request.json();
  const ts = Number(body?.timestamp);
  if (!Number.isFinite(ts)) return json({ error: 'timestamp (ms) required' }, { status: 400 });
  const row = db.prepare(`UPDATE start_events SET ts_ms = ? WHERE id = ? RETURNING id, stage_id, driver_id, ts_ms`).get(ts, id);
  return json(row ?? { error: 'Not found' }, { status: row ? 200 : 404 });
}

export async function DELETE({ params }: RequestEvent) {
  const id = Number(params.id);
  const res = db.prepare(`DELETE FROM start_events WHERE id = ?`).run(id);
  return new Response(null, { status: res.changes ? 204 : 404 });
}
