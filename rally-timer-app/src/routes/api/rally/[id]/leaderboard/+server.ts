import { json } from '@sveltejs/kit';
import Database from 'better-sqlite3';
import type { RequestEvent } from './$types';

const db = new Database('database.sqlite', { fileMustExist: true });

export async function GET({ params }: RequestEvent) {
  const rallyId = Number(params.id);
  const rows = db
    .prepare(`
      SELECT driver_id, driver_name, class_name,
             total_ms, delta_p1, delta_prev,
             position
      FROM rally_leaderboard
      WHERE rally_id = ?
      ORDER BY position
    `)
    .all(rallyId);
  return json(rows);
}
