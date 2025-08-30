import { json } from '@sveltejs/kit';
import Database from 'better-sqlite3';
import type { RequestEvent } from './$types';

const db = new Database('database.sqlite', { fileMustExist: true });

// Update stage (only name)
export async function PATCH({ params, request }: RequestEvent) {
  const id = Number(params.id);
  const { name } = await request.json();

  if (!name || !name.trim()) {
    return json({ error: 'Stage name required' }, { status: 400 });
  }

  const row = db
    .prepare('UPDATE stages SET name = ? WHERE id = ? RETURNING id, rally_id, name')
    .get(name.trim(), id);

  return json(row ?? { error: 'Not found' }, { status: row ? 200 : 404 });
}

// Delete stage
export async function DELETE({ params }: RequestEvent) {
  const id = Number(params.id);
  const res = db.prepare('DELETE FROM stages WHERE id = ?').run(id);
  return new Response(null, { status: res.changes > 0 ? 204 : 404 });
}
