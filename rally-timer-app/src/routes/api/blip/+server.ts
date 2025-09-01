import { json, type RequestEvent } from "@sveltejs/kit";
import { db } from "../../../lib/server/db";

export async function POST({ request }) {
  const { stage_id, tag } = await request.json();
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

export async function GET() {
  const rows = db.prepare(`
    SELECT 
      be.id,
      be.stage_id,
      be.timestamp,
      be.tag,
      s.name   AS stage_name,
      r.name   AS rally_name
    FROM blip_events be
    JOIN stages s ON be.stage_id = s.id
    JOIN rallies r ON s.rally_id = r.id
    ORDER BY be.timestamp DESC
    LIMIT 200
  `).all();
  return json(rows);
}

export async function DELETE(event: RequestEvent): Promise<Response> {
  db.pragma('journal_mode = WAL');
  db.exec("DELETE FROM blip_events");

  return new Response(null, { status: 204 });
}
