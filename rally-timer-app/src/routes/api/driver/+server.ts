import { json, type RequestEvent } from "@sveltejs/kit";
import Database from "better-sqlite3";
import { z } from "zod";

const db = new Database('database.sqlite', { fileMustExist: true });
const NewDriver = z.object({ name: z.string().trim().min(1).max(200) });

export async function POST(event: RequestEvent): Promise<Response> {
  const body = await event.request.json();
  const parsed = NewDriver.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.flatten() }, { status: 400 });

  db.pragma('journal_mode = WAL');
  const created = db.prepare(
    "INSERT INTO drivers(name) VALUES(?) RETURNING id, name;"
  ).get(parsed.data.name);

  return json(created, { status: 201 });
}

export async function GET(_event: RequestEvent): Promise<Response> {
  db.pragma('journal_mode = WAL');
  const drivers = db.prepare("SELECT id, name FROM drivers ORDER BY id;").all();
  return json(drivers);
}

export async function DELETE(_event: RequestEvent): Promise<Response> {
  db.pragma('journal_mode = WAL');
  db.exec("DELETE FROM drivers");
  return new Response(null, { status: 204 });
}
