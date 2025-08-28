import { json, type RequestEvent } from "@sveltejs/kit";
import Database from "better-sqlite3";
import { NewGateEvent } from "../../../../lib/types";

const db = new Database('database.sqlite', { fileMustExist: true });

export async function POST(event: RequestEvent): Promise<Response> {
  const newGateEvent = NewGateEvent.parse(await event.request.json());

  db.pragma('journal_mode = WAL');
  let result = db.prepare("INSERT INTO gate_events(gate_id, timestamp) VALUES(?,?) returning *;").get(event.params.gateId, newGateEvent.timestamp);

  return json(result);
}

export async function DELETE(event: RequestEvent): Promise<Response> {
  let result = db.prepare("DELETE FROM gate_events WHERE id = ?;").run(event.params.gateId);
  return json(result);
}
