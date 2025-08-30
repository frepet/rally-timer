import { json, type RequestEvent } from "@sveltejs/kit";
import Database from "better-sqlite3";
import { NewBlipEvent } from "../../../../../lib/types";

const db = new Database('database.sqlite', { fileMustExist: true });

export async function POST(event: RequestEvent): Promise<Response> {
  const newBlipEvent = NewBlipEvent.parse(await event.request.json());

  db.pragma('journal_mode = WAL');
  let result = db.prepare("INSERT INTO blip_events(stage_id, timestamp, tag) VALUES(?,?,?) returning *;")
    .get(event.params.id, newBlipEvent.timestamp, newBlipEvent.tag);

  return json(result);
}
