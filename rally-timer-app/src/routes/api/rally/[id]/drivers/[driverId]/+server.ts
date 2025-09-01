import { db } from "../../../../../../lib/server/db";

export async function DELETE({ params }) {
  const rallyId = Number(params.id);
  const driverId = Number(params.driverId);
  db.pragma('journal_mode = WAL');
  const res = db
    .prepare(`DELETE FROM rally_drivers WHERE rally_id = ? AND driver_id = ?;`)
    .run(rallyId, driverId);
  if (res.changes === 0) return new Response(null, { status: 404 });
  return new Response(null, { status: 204 });
}
