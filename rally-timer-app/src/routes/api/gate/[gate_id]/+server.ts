import { json, type RequestEvent } from "@sveltejs/kit";
import Database from "better-sqlite3";
import { NewPassing } from "../../../../lib/types";

const db = new Database('database.sqlite', { fileMustExist: true });

export async function POST(event: RequestEvent): Promise<Response> {
  const passing = NewPassing.parse(await event.request.json());

  db.pragma('journal_mode = WAL');
  let result = db.prepare("INSERT INTO gate_events(gate_id, timestamp) VALUES(?,?) returning *;").get(event.params.gate_id, passing.timestamp);

  return json(result);
}

export async function DELETE(event: RequestEvent): Promise<Response> {
  let result = db.prepare("DELETE FROM gate_events WHERE id = ?;").run(event.params.gate_id);
  return json(result);
}
