import { json } from '@sveltejs/kit';
import Database from 'better-sqlite3';
import type { RequestEvent } from './$types';

const db = new Database('database.sqlite', { fileMustExist: true });

// List stages for a rally
export async function GET({ params }: RequestEvent) {
  const rallyId = Number(params.id);
  const rows = db
    .prepare('SELECT id, rally_id, name FROM stages WHERE rally_id = ? ORDER BY id')
    .all(rallyId);
  return json(rows);
}

// Create stage (name only)
export async function POST({ params, request }: RequestEvent) {
  const rallyId = Number(params.id);
  const { name } = await request.json();

  if (!name || !name.trim()) {
    return json({ error: 'Stage name required' }, { status: 400 });
  }

  const row = db
    .prepare('INSERT INTO stages (rally_id, name) VALUES (?, ?) RETURNING id, rally_id, name')
    .get(rallyId, name.trim());

  return json(row, { status: 201 });
}
