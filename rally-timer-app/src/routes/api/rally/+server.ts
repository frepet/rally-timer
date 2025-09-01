import { json, type RequestEvent } from "@sveltejs/kit";
import { db } from "../../../lib/server/db";

export async function GET() {
  db.pragma('journal_mode = WAL');
  const rows = db.prepare("SELECT id, name FROM rallies ORDER BY id;").all();
  return json(rows);
}

export async function POST(event: RequestEvent) {
  const { name } = await event.request.json();
  if (!name || !String(name).trim()) return json({ error: 'name required' }, { status: 400 });
  db.pragma('journal_mode = WAL');
  const row = db.prepare("INSERT INTO rallies(name) VALUES(?) RETURNING id, name;").get(String(name).trim());
  return json(row, { status: 201 });
}
