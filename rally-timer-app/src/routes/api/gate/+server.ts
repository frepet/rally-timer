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

export async function GET() {
  const rows = db.prepare(`
    SELECT 
      be.id,
      be.stage_id,
      be.timestamp,
      s.name   AS stage_name,
      r.name   AS rally_name
    FROM gate_events be
    JOIN stages s ON be.stage_id = s.id
    JOIN rallies r ON s.rally_id = r.id
    ORDER BY be.timestamp DESC
    LIMIT 200
  `).all();
  return json(rows);
}

export async function DELETE(event: RequestEvent): Promise<Response> {
  await throwIfNotAdmin(event);
  db.pragma('journal_mode = WAL');
  db.exec("DELETE FROM gate_events");
  return new Response(null, { status: 204 });
}
