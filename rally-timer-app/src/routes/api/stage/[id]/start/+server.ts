import { json } from '@sveltejs/kit';
import { db } from '../../../../../lib/server/db';

export async function POST({ params, request }) {
  const stageId = Number(params.id);
  const { driver_id } = await request.json();
  if (!stageId || !driver_id)
    return json({ error: 'stageId & driver_id required' }, { status: 400 });

  db.pragma('journal_mode = WAL');
  const ts_ms = Date.now();

  const row = db
    .prepare(
      `
    INSERT INTO start_events(stage_id, driver_id, ts_ms)
    VALUES(?,?,?)
    RETURNING id, stage_id, driver_id, ts_ms;
  `
    )
    .get(stageId, Number(driver_id), ts_ms);

  return json(row, { status: 201 });
}
