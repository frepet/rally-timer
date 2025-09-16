import { json, type RequestEvent } from "@sveltejs/kit";
import { db } from "../../../lib/server/db";
import { throwIfNotAdmin } from "../../../lib/server/keycloak";

export async function POST(event: RequestEvent): Promise<Response> {
  await throwIfNotAdmin(event);
  const { stage_id } = await event.request.json();
  if (!stage_id) return json({ error: "stage_id required" }, { status: 400 });

  db.pragma("journal_mode = WAL");
  const ts_ms = Date.now();

  const row = db.prepare(`
    INSERT INTO gate_events(stage_id, timestamp)
    VALUES(?, ?)
    RETURNING id, stage_id, timestamp;
  `).get(Number(stage_id), ts_ms);

  return json(row, { status: 201 });
}
