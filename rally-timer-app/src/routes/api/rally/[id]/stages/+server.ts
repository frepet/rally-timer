import { json } from "@sveltejs/kit";
import Database from "better-sqlite3";

const db = new Database('database.sqlite', { fileMustExist: true });

export async function GET({ params }) {
  const rallyId = Number(params.id);
  db.pragma('journal_mode = WAL');
  const rows = db.prepare(`
    SELECT id, rally_id, name, gate_id, blip_id
    FROM stages
    WHERE rally_id = ?
    ORDER BY id;
  `).all(rallyId);
  return json(rows);
}

export async function POST({ params, request }) {
  const rallyId = Number(params.id);
  const { name, gate_id, blip_id } = await request.json();
  if (!name || !gate_id || !blip_id) return json({ error: 'name, gate_id, blip_id required' }, { status: 400 });

  db.pragma('journal_mode = WAL');
  const row = db.prepare(`
    INSERT INTO stages(rally_id, name, gate_id, blip_id)
    VALUES(?, ?, ?, ?)
    RETURNING id, rally_id, name, gate_id, blip_id;
  `).get(rallyId, String(name).trim(), String(gate_id).trim(), String(blip_id).trim());
  return json(row, { status: 201 });
}
