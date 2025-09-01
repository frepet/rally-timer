import { json } from '@sveltejs/kit';
import { db } from '../../../../../lib/server/db';

export async function GET({ params }) {
  const rallyId = Number(params.id);
  db.pragma('journal_mode = WAL');
  // If you already use rally_drivers, prefer that; else fall back to all drivers.
  const rows = db
    .prepare(
      `
    SELECT d.id, d.name, d.tag, d.class_id, c.name AS class_name
    FROM rally_drivers rd
    JOIN drivers d ON d.id = rd.driver_id
    LEFT JOIN classes c ON c.id = d.class_id
    WHERE rd.rally_id = ?
    ORDER BY d.name;
  `
    )
    .all(rallyId);
  return json(rows);
}

export async function POST({ params, request }) {
  const rallyId = Number(params.id);
  const { driver_id } = await request.json();
  if (!rallyId || !driver_id)
    return json({ error: 'rallyId and driver_id required' }, { status: 400 });

  db.pragma('journal_mode = WAL');
  // idempotent insert (ignore duplicates)
  db.prepare(`INSERT OR IGNORE INTO rally_drivers(rally_id, driver_id) VALUES(?, ?);`).run(
    rallyId,
    Number(driver_id)
  );

  // return current assignment
  const row = db
    .prepare(
      `
    SELECT d.id, d.name, d.tag, d.class_id, c.name AS class_name
    FROM drivers d
    LEFT JOIN classes c ON c.id = d.class_id
    WHERE d.id = ?;
  `
    )
    .get(Number(driver_id));

  return json(row, { status: 201 });
}
