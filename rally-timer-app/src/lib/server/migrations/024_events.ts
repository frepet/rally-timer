import type { Sql } from '../db';

export async function runMigration(sql: Sql) {
	// This migration includes legacy data backfills; replay must never undo later user edits.
	await sql`CREATE TABLE IF NOT EXISTS event_migration_state (id INTEGER PRIMARY KEY)`;
	const [done] = await sql`SELECT id FROM event_migration_state WHERE id=1`;
	if (done) return;
	await sql`
  CREATE TABLE IF NOT EXISTS events (
   id SERIAL PRIMARY KEY,
   type TEXT NOT NULL CHECK (type IN ('rally', 'rallycross', 'training')),
   name TEXT NOT NULL,
   created_at BIGINT NOT NULL,
   is_locked BOOLEAN NOT NULL DEFAULT FALSE,
   legacy_workspace TEXT UNIQUE,
   CHECK (type <> 'training' OR NOT is_locked)
  )`;
	for (const [type, name] of [
		['rally', 'Migrated rally'],
		['rallycross', 'Migrated rallycross'],
		['training', 'Migrated training']
	]) {
		await sql`INSERT INTO events (type,name,created_at,legacy_workspace) VALUES (${type},${name},${Date.now()},${type}) ON CONFLICT (legacy_workspace) DO NOTHING`;
	}
	await sql`CREATE TABLE IF NOT EXISTS event_participants (event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE, driver_id INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE, PRIMARY KEY(event_id,driver_id))`;
	await sql`INSERT INTO event_participants SELECT e.id,d.id FROM events e CROSS JOIN drivers d WHERE e.legacy_workspace IS NOT NULL AND d.active ON CONFLICT DO NOTHING`;
	await sql`ALTER TABLE stages ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id) ON DELETE CASCADE`;
	await sql`UPDATE stages SET event_id=(SELECT id FROM events WHERE legacy_workspace='rally') WHERE event_id IS NULL`;
	await sql`ALTER TABLE stages ALTER COLUMN event_id SET NOT NULL`;
	await sql`DROP INDEX IF EXISTS stages_uniq_name`;
	await sql`CREATE UNIQUE INDEX IF NOT EXISTS stages_event_name ON stages(event_id,name)`;
	for (const table of ['rallycross', 'training']) {
		await sql`ALTER TABLE ${sql(table)} ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id) ON DELETE CASCADE`;
		await sql`UPDATE ${sql(table)} SET event_id=(SELECT id FROM events WHERE legacy_workspace=${table}) WHERE event_id IS NULL`;
		await sql`ALTER TABLE ${sql(table)} ALTER COLUMN event_id SET NOT NULL`;
		await sql`ALTER TABLE ${sql(table)} DROP CONSTRAINT IF EXISTS ${sql(`${table}_id_check`)}`;
		await sql`CREATE SEQUENCE IF NOT EXISTS ${sql(`${table}_id_seq`)}`;
		await sql`SELECT setval(${`${table}_id_seq`}::regclass, GREATEST((SELECT MAX(id) FROM ${sql(table)}), 1))`;
		if (table === 'rallycross')
			await sql`ALTER TABLE rallycross ALTER COLUMN id SET DEFAULT nextval('rallycross_id_seq'::regclass)`;
		else
			await sql`ALTER TABLE training ALTER COLUMN id SET DEFAULT nextval('training_id_seq'::regclass)`;
		await sql`CREATE UNIQUE INDEX IF NOT EXISTS ${sql(`${table}_event_unique`)} ON ${sql(table)}(event_id)`;
	}
	await sql`ALTER TABLE rallycross_heats ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id) ON DELETE CASCADE`;
	await sql`UPDATE rallycross_heats SET event_id=(SELECT id FROM events WHERE legacy_workspace='rallycross') WHERE event_id IS NULL`;
	await sql`ALTER TABLE rallycross_heats ALTER COLUMN event_id SET NOT NULL`;
	await sql`ALTER TABLE submitted_rallies ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id) ON DELETE SET NULL`;
	await sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS pinned_event_id INTEGER REFERENCES events(id) ON DELETE SET NULL`;
	await sql`UPDATE settings SET pinned_event_id=(SELECT id FROM events WHERE legacy_workspace=settings.pinned_view) WHERE pinned_event_id IS NULL AND pinned_view IS NOT NULL`;
	await sql`CREATE TABLE IF NOT EXISTS gate_assignments (id SERIAL PRIMARY KEY, gate_id TEXT NOT NULL REFERENCES gates(id) ON DELETE CASCADE, event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE, stage_id INTEGER REFERENCES stages(id) ON DELETE SET NULL, assigned_at BIGINT NOT NULL, released_at BIGINT)`;
	await sql`CREATE UNIQUE INDEX IF NOT EXISTS gate_assignments_active_gate ON gate_assignments(gate_id) WHERE released_at IS NULL`;
	await sql`CREATE TABLE IF NOT EXISTS gate_event_events (event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE, gate_event_id INTEGER NOT NULL REFERENCES gate_events(id) ON DELETE CASCADE, PRIMARY KEY(event_id,gate_event_id))`;
	// Legacy passes may legitimately have appeared in both modes; preserve both histories.
	for (const table of ['rallycross', 'training']) {
		await sql`INSERT INTO gate_event_events SELECT c.event_id,ge.id FROM ${sql(table)} c JOIN gate_events ge ON ge.gate_id=c.gate_id WHERE c.started_at IS NOT NULL AND ge.timestamp >= c.started_at ON CONFLICT DO NOTHING`;
	}
	await sql`INSERT INTO gate_event_events SELECT s.event_id,ge.id FROM gates g JOIN stages s ON s.id=g.stage_id JOIN gate_events ge ON ge.gate_id=g.id ON CONFLICT DO NOTHING`;
	// Existing stage ownership wins if legacy modes claimed the same physical gate.
	await sql`INSERT INTO gate_assignments(gate_id,event_id,stage_id,assigned_at) SELECT g.id,s.event_id,s.id,0 FROM gates g JOIN stages s ON s.id=g.stage_id ON CONFLICT DO NOTHING`;
	for (const table of ['rallycross', 'training']) {
		await sql`INSERT INTO gate_assignments(gate_id,event_id,assigned_at) SELECT gate_id,event_id,COALESCE(started_at,0) FROM ${sql(table)} WHERE gate_id IS NOT NULL ON CONFLICT DO NOTHING`;
		await sql`UPDATE ${sql(table)} c SET gate_id=NULL WHERE gate_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM gate_assignments a WHERE a.gate_id=c.gate_id AND a.event_id=c.event_id AND a.released_at IS NULL)`;
	}
	await sql`CREATE INDEX IF NOT EXISTS gate_assignments_history ON gate_assignments(gate_id,assigned_at,released_at)`;
	await sql`INSERT INTO event_migration_state(id) VALUES(1) ON CONFLICT DO NOTHING`;
}
