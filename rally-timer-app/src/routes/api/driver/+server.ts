import { json, type RequestEvent } from "@sveltejs/kit";
import Database from "better-sqlite3";

const db = new Database('database.sqlite', { fileMustExist: true });

export async function POST(event: RequestEvent): Promise<Response> {
  const { name, class_id, tag } = await event.request.json();
  if (!name || !class_id || !tag) return json({ error: 'name, class_id, tag required' }, { status: 400 });

  db.pragma('journal_mode = WAL');
  const row = db.prepare(`
    INSERT INTO drivers(name, class_id, tag)
    VALUES(?, ?, ?)
    RETURNING id, name, class_id, tag;
  `).get(name.trim(), Number(class_id), String(tag).trim());

  return json(row, { status: 201 });
}

export async function GET(): Promise<Response> {
  db.pragma('journal_mode = WAL');
  const rows = db.prepare(`
    SELECT d.id, d.name, d.class_id, d.tag, c.name AS class_name
    FROM drivers d
    LEFT JOIN classes c ON c.id = d.class_id
    ORDER BY d.id;
  `).all();
  return json(rows);
}

export async function DELETE(): Promise<Response> {
  db.pragma('journal_mode = WAL');
  db.exec("DELETE FROM drivers");
  return new Response(null, { status: 204 });
}
