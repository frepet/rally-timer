import { json } from "@sveltejs/kit";
import { db } from "../../../lib/server/db";
import { throwIfNotAdmin } from "../../../lib/server/keycloak";

export async function POST(event) {
  await throwIfNotAdmin(event);
  const { stage_id, tag } = await event.request.json();
  if (!stage_id || !tag) return json({ error: "stage_id and tag required" }, { status: 400 });

  db.pragma("journal_mode = WAL");
  const ts_ms = Date.now();

  const row = db.prepare(`
    INSERT INTO blip_events(stage_id, timestamp, tag)
    VALUES(?, ?, ?)
    RETURNING id, stage_id, timestamp, tag;
  `).get(Number(stage_id), ts_ms, String(tag).trim());

  return json(row, { status: 201 });
}
