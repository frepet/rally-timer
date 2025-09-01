import { json } from '@sveltejs/kit';
import { db } from '../../../../../lib/server/db';

export async function GET({ params }) {
  const rallyId = Number(params.id);
  db.pragma('journal_mode = WAL');
  const rows = db
    .prepare(
      `
    SELECT driver_id, driver_name, class_name, total_ms, finished_stages
    FROM rally_times
    WHERE rally_id = ?
    ORDER BY total_ms ASC;
  `
    )
    .all(rallyId);
  return json(rows);
}
