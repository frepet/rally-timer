import { json } from "@sveltejs/kit";
import Database from "better-sqlite3";

const db = new Database('database.sqlite', { fileMustExist: true });

export async function GET() {
  db.pragma('journal_mode = WAL');
  const rows = db.prepare("SELECT id, name FROM classes ORDER BY name;").all();
  return json(rows);
}
