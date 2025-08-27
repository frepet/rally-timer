import { json, type RequestEvent } from "@sveltejs/kit";
import Database from "better-sqlite3";

export async function GET(event: RequestEvent): Promise<Response> {
  const db = new Database('database.sqlite', { fileMustExist: true });
  db.pragma('journal_mode = WAL');
  let passings = db.prepare("SELECT * FROM passings ORDER BY(timestamp)").all();

  return json(passings);
}
