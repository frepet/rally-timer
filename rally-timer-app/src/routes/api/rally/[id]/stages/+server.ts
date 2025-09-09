import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { db } from '../../../../../lib/server/db';
import { throwIfNotAdmin } from '../../../../../lib/server/keycloak';

// List stages for a rally
export async function GET({ params }: RequestEvent) {
  const rallyId = Number(params.id);
  const rows = db
    .prepare('SELECT id, rally_id, name FROM stages WHERE rally_id = ? ORDER BY id')
    .all(rallyId);
  return json(rows);
}

// Create stage (name only)
export async function POST(event: RequestEvent) {
  await throwIfNotAdmin(event);
  const rallyId = Number(event.params.id);
  const { name } = await event.request.json();

  if (!name || !name.trim()) {
    return json({ error: 'Stage name required' }, { status: 400 });
  }

  const row = db
    .prepare('INSERT INTO stages (rally_id, name) VALUES (?, ?) RETURNING id, rally_id, name')
    .get(rallyId, name.trim());

  return json(row, { status: 201 });
}
