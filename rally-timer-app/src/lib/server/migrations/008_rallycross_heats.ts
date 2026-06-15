import type { Sql } from '../db';

export async function runMigration(sql: Sql) {
	await sql.unsafe(`
		ALTER TABLE rallycross
			ADD COLUMN IF NOT EXISTS max_per_heat  INTEGER NOT NULL DEFAULT 4,
			ADD COLUMN IF NOT EXISTS required_laps INTEGER NOT NULL DEFAULT 3;

		CREATE TABLE IF NOT EXISTS rallycross_heats (
			id            SERIAL PRIMARY KEY,
			number        INTEGER NOT NULL,
			required_laps INTEGER NOT NULL,
			started_at    BIGINT,
			closed_at     BIGINT
		);

		CREATE TABLE IF NOT EXISTS rallycross_heat_entries (
			heat_id     INTEGER NOT NULL REFERENCES rallycross_heats(id) ON DELETE CASCADE,
			driver_id   INTEGER NOT NULL REFERENCES drivers(id)          ON DELETE CASCADE,
			ts_ms       BIGINT,
			dnf         BOOLEAN NOT NULL DEFAULT FALSE,
			dnf_time_ms BIGINT,
			PRIMARY KEY (heat_id, driver_id)
		);
	`);
}
