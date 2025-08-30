import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import Database from 'better-sqlite3';

const db = new Database('database.sqlite', { fileMustExist: true });

export const GET: RequestHandler = ({ params }) => {
  const rallyId = Number(params.id);
  if (!Number.isFinite(rallyId)) {
    return json({ error: 'Invalid rallyId' }, { status: 400 });
  }

  // Drivers signed up for this rally, with class names
  const drivers = db.prepare(`
		SELECT d.id, d.name, d.tag AS rfid_tag, d.class_id, c.name AS class_name
		FROM rally_drivers rd
		JOIN drivers d ON d.id = rd.driver_id
		JOIN classes c ON c.id = d.class_id
		WHERE rd.rally_id = ?
	`).all(rallyId);

  // Stages
  const stages = db.prepare(`
		SELECT id, name
		FROM stages
		WHERE rally_id = ?
		ORDER BY id
	`).all(rallyId);

  // Start events for all stages in this rally
  const start_events = db.prepare(`
		SELECT se.id, se.stage_id, se.driver_id, se.ts_ms AS ts
		FROM start_events se
		JOIN stages s ON s.id = se.stage_id
		WHERE s.rally_id = ?
	`).all(rallyId);

  // Gate events
  const gate_events = db.prepare(`
		SELECT ge.id, ge.stage_id, ge.timestamp AS ts
		FROM gate_events ge
		JOIN stages s ON s.id = ge.stage_id
		WHERE s.rally_id = ?
	`).all(rallyId);

  // Blip events
  const blip_events = db.prepare(`
		SELECT be.id, be.stage_id, be.timestamp AS ts, be.tag
		FROM blip_events be
		JOIN stages s ON s.id = be.stage_id
		WHERE s.rally_id = ?
	`).all(rallyId);

  return json({ drivers, stages, start_events, gate_events, blip_events });
};
