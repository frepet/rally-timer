import { json } from '@sveltejs/kit';
import Database from 'better-sqlite3';
import type { RequestEvent } from './$types';

const db = new Database('database.sqlite', { fileMustExist: true });

export async function GET({ params }: RequestEvent) {
  const stageId = Number(params.id);
  const rows = db
    .prepare(`
      SELECT driver_id, driver_name, class_name,
             stage_ms, delta_p1, delta_prev,
             position
      FROM stage_leaderboard
      WHERE stage_id = ?
      ORDER BY position
    `)
    .all(stageId);
  return json(rows);
}
