import { sql } from '../db';

export async function runMigration() {
	await sql.begin(async (tx) => { await tx.unsafe(`
		ALTER TABLE drivers ADD COLUMN IF NOT EXISTS uuid UUID NOT NULL DEFAULT gen_random_uuid();
		CREATE UNIQUE INDEX IF NOT EXISTS drivers_uuid_idx ON drivers(uuid);

		CREATE TABLE IF NOT EXISTS championships (
			id         UUID   PRIMARY KEY DEFAULT gen_random_uuid(),
			name       TEXT   NOT NULL UNIQUE,
			created_at BIGINT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS submitted_rallies (
			id           UUID   PRIMARY KEY DEFAULT gen_random_uuid(),
			name         TEXT   NOT NULL,
			submitted_at BIGINT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS championship_rallies (
			championship_id UUID NOT NULL REFERENCES championships(id)     ON DELETE CASCADE,
			rally_id        UUID NOT NULL REFERENCES submitted_rallies(id) ON DELETE CASCADE,
			PRIMARY KEY (championship_id, rally_id)
		);

		CREATE TABLE IF NOT EXISTS rally_results (
			rally_id    UUID    NOT NULL REFERENCES submitted_rallies(id) ON DELETE CASCADE,
			driver_uuid UUID    NOT NULL,
			driver_name TEXT    NOT NULL,
			class_id    INTEGER NOT NULL REFERENCES classes(id),
			class_name  TEXT    NOT NULL,
			stage_name  TEXT    NOT NULL,
			elapsed_ms  BIGINT,
			PRIMARY KEY (rally_id, driver_uuid, stage_name)
		);

		CREATE INDEX IF NOT EXISTS rally_results_rally_idx  ON rally_results(rally_id);
		CREATE INDEX IF NOT EXISTS rally_results_driver_idx ON rally_results(driver_uuid);
		CREATE INDEX IF NOT EXISTS championship_rallies_champ ON championship_rallies(championship_id);
	`); });
}
