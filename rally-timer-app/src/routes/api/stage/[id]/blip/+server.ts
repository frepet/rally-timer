import { json, type RequestEvent } from "@sveltejs/kit";
import { NewBlipEvent } from "../../../../../lib/types";
import { db } from "../../../../../lib/server/db";

export async function POST(event: RequestEvent): Promise<Response> {
  const newBlipEvent = NewBlipEvent.parse(await event.request.json());

  db.pragma('journal_mode = WAL');
  let result = db.prepare("INSERT INTO blip_events(stage_id, timestamp, tag) VALUES(?,?,?) returning *;")
    .get(event.params.id, newBlipEvent.timestamp, newBlipEvent.tag);

  return json(result);
}
