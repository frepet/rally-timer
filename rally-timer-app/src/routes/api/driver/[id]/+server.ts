import { json, type RequestEvent } from "@sveltejs/kit";
import Database from "better-sqlite3";
import { z } from "zod";

const db = new Database('database.sqlite', { fileMustExist: true });
const UpdateDriver = z.object({ name: z.string().trim().min(1).max(200) });

export async function GET(event: RequestEvent): Promise<Response> {
  const id = Number(event.params.id);
  db.pragma('journal_mode = WAL');
  const row = db.prepare("SELECT id, name FROM drivers WHERE id = ?;").get(id);
  if (!row) return new Response(null, { status: 404 });
  return json(row);
}

export async function PUT(event: RequestEvent): Promise<Response> {
  const id = Number(event.params.id);
  const body = await event.request.json();
  const parsed = UpdateDriver.safeParse(body);
  if (!parsed.success) return json({ error: z.treeifyError(body) }, { status: 400 });

  db.pragma('journal_mode = WAL');
  const updated = db.prepare(
    "UPDATE drivers SET name = ? WHERE id = ? RETURNING id, name;"
  ).get(parsed.data.name, id);

  if (!updated) return new Response(null, { status: 404 });
  return json(updated);
}

export async function DELETE(event: RequestEvent): Promise<Response> {
  const id = Number(event.params.id);
  db.pragma('journal_mode = WAL');
  const result = db.prepare("DELETE FROM drivers WHERE id = ?;").run(id);
  if (result.changes === 0) return new Response(null, { status: 404 });
  return new Response(null, { status: 204 });
}
