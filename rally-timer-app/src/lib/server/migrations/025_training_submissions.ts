import type { Sql } from '../db';

export async function runMigration(sql: Sql) {
	// Training events can now be finalized by submission. Older schemas created
	// this unnamed check from `CHECK (type <> 'training' OR NOT is_locked)`.
	await sql`ALTER TABLE events DROP CONSTRAINT IF EXISTS events_check`;

	await sql`
		ALTER TABLE submitted_rallies
		ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'rally'
		CHECK (event_type IN ('rally', 'rallycross', 'training'))
	`;
	await sql`
		UPDATE submitted_rallies sr
		SET event_type = e.type
		FROM events e
		WHERE sr.event_id = e.id AND sr.event_type <> e.type
	`;

	await sql`
		CREATE TABLE IF NOT EXISTS submitted_training_results (
			rally_id     UUID    NOT NULL REFERENCES submitted_rallies(id) ON DELETE CASCADE,
			driver_id    INTEGER NOT NULL,
			driver_name  TEXT    NOT NULL,
			class_id     INTEGER,
			class_name   TEXT,
			tag          TEXT    NOT NULL,
			lap_count    INTEGER NOT NULL,
			best_lap_ms  BIGINT,
			median_lap_ms BIGINT,
			last_lap_ms  BIGINT,
			last_pass_ms BIGINT,
			laps         JSONB   NOT NULL,
			PRIMARY KEY (rally_id, driver_id)
		)
	`;
	await sql`
		CREATE INDEX IF NOT EXISTS submitted_training_results_rally_idx
		ON submitted_training_results(rally_id)
	`;
}
