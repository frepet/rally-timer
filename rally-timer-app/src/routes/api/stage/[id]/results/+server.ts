import { json } from '@sveltejs/kit';
import { db } from '../../../../../lib/server/db';

export async function GET({ params }) {
  const stageId = Number(params.id);
  db.pragma('journal_mode = WAL');
  const rows = db
    .prepare(
      `
    SELECT driver_id, driver_name, class_name, start_ms, finish_ms, elapsed_ms
    FROM stage_times
    WHERE stage_id = ?
    ORDER BY elapsed_ms ASC;
  `
    )
    .all(stageId);
  return json(rows);
}
