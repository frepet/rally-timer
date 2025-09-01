import { json, type RequestEvent } from "@sveltejs/kit";
import { db } from "../../../../lib/server/db";

export async function PATCH(event: RequestEvent): Promise<Response> {
  const id = Number(event.params.id);
  const raw = (await event.request.json()) as unknown;

  // Ensure object shape, then cast to a type with optional keys
  if (!raw || typeof raw !== "object") return new Response(null, { status: 400 });
  const r = raw as { name?: unknown; class_id?: unknown; tag?: unknown };

  // Build patch with guards
  const patch: { name?: string; class_id?: number; tag?: string } = {};

  if (typeof r.name === "string" && r.name.trim()) patch.name = r.name.trim();

  if (typeof r.tag === "string" && r.tag.trim()) patch.tag = r.tag.trim();

  if (typeof r.class_id === "number" && Number.isFinite(r.class_id) && r.class_id > 0) {
    patch.class_id = r.class_id;
  } else if (typeof r.class_id === "string" && r.class_id.trim()) {
    const n = Number(r.class_id);
    if (Number.isFinite(n) && n > 0) patch.class_id = n;
  }

  // Nothing to update
  if (!("name" in patch) && !("class_id" in patch) && !("tag" in patch)) {
    return new Response(null, { status: 204 });
  }

  db.pragma("journal_mode = WAL");

  const cur = db.prepare("SELECT id, name, class_id, tag FROM drivers WHERE id = ?;").get(id) as { name: string, class_id: number, tag: string };
  if (!cur) return new Response(null, { status: 404 });

  const next = {
    name: patch.name ?? cur.name,
    class_id: patch.class_id ?? cur.class_id,
    tag: patch.tag ?? cur.tag
  };

  const row = db
    .prepare(
      `
      UPDATE drivers
      SET name = ?, class_id = ?, tag = ?
      WHERE id = ?
      RETURNING id, name, class_id, tag;
    `
    )
    .get(next.name, next.class_id, next.tag, id);

  return json(row);
}

export async function DELETE(event: RequestEvent): Promise<Response> {
  const id = Number(event.params.id);
  const res = db.prepare("DELETE FROM drivers WHERE id = ?;").run(id);
  if (res.changes === 0) return new Response(null, { status: 404 });
  return new Response(null, { status: 204 });
}
