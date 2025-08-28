import { json, type RequestEvent } from "@sveltejs/kit";
import Database from "better-sqlite3";

const db = new Database('database.sqlite', { fileMustExist: true });

export async function GET(event: RequestEvent): Promise<Response> {
  db.pragma('journal_mode = WAL');
  let passings = db.prepare("SELECT id, blip_id AS blipId, timestamp, tag FROM blip_events ORDER BY(timestamp)").all();

  return json(passings);
}

export async function DELETE(event: RequestEvent): Promise<Response> {
  db.pragma('journal_mode = WAL');
  db.exec("DELETE FROM blip_events");

  return new Response(null, { status: 204 });
}
