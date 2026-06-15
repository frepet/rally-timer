import type { Sql } from '../db';

export async function runMigration(sql: Sql) {
	await sql.unsafe(`
			CREATE TABLE IF NOT EXISTS classes (
				id   SERIAL PRIMARY KEY,
				name TEXT   NOT NULL UNIQUE
			);

			CREATE TABLE IF NOT EXISTS drivers (
				id       SERIAL  PRIMARY KEY,
				name     TEXT    NOT NULL,
				class_id INTEGER NOT NULL REFERENCES classes(id) ON UPDATE CASCADE ON DELETE RESTRICT,
				tag      TEXT    NOT NULL UNIQUE,
				active   BOOLEAN NOT NULL DEFAULT true,
				uuid     UUID    NOT NULL DEFAULT gen_random_uuid()
			);

			CREATE TABLE IF NOT EXISTS stages (
				id   SERIAL PRIMARY KEY,
				name TEXT   NOT NULL
			);

			CREATE TABLE IF NOT EXISTS finish_events (
				id        SERIAL  PRIMARY KEY,
				stage_id  INTEGER NOT NULL REFERENCES stages(id)  ON DELETE CASCADE,
				timestamp BIGINT  NOT NULL,
				tag       TEXT    NOT NULL,
				dnf       BOOLEAN NOT NULL DEFAULT FALSE
			);

			CREATE TABLE IF NOT EXISTS start_events (
				id        SERIAL  PRIMARY KEY,
				stage_id  INTEGER NOT NULL REFERENCES stages(id)  ON DELETE CASCADE,
				driver_id INTEGER NOT NULL REFERENCES drivers(id) ON DELETE RESTRICT,
				ts_ms     BIGINT  NOT NULL
			);

			CREATE TABLE IF NOT EXISTS gates (
				id         TEXT   PRIMARY KEY,
				name       TEXT,
				last_seen  BIGINT  NOT NULL,
				stage_id   INTEGER,
				created_at BIGINT  NOT NULL
			);

			CREATE TABLE IF NOT EXISTS gate_events (
				id        SERIAL PRIMARY KEY,
				gate_id   TEXT   NOT NULL REFERENCES gates(id) ON DELETE CASCADE,
				tag       TEXT   NOT NULL,
				timestamp BIGINT NOT NULL,
				rssi      INTEGER,
				synced_at BIGINT NOT NULL
			);

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
				dnf         BOOLEAN NOT NULL DEFAULT FALSE,
				PRIMARY KEY (rally_id, driver_uuid, stage_name)
			);

			-- Columns added in later migrations; safe no-ops on fresh installs
			ALTER TABLE drivers       ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
			ALTER TABLE drivers       ADD COLUMN IF NOT EXISTS uuid   UUID    NOT NULL DEFAULT gen_random_uuid();
			ALTER TABLE finish_events ADD COLUMN IF NOT EXISTS dnf    BOOLEAN NOT NULL DEFAULT FALSE;
			ALTER TABLE rally_results ADD COLUMN IF NOT EXISTS dnf    BOOLEAN NOT NULL DEFAULT FALSE;

			-- Indexes
			CREATE INDEX        IF NOT EXISTS idx_drivers_tag             ON drivers(tag);
			CREATE INDEX        IF NOT EXISTS idx_drivers_name            ON drivers(name);
			CREATE UNIQUE INDEX IF NOT EXISTS drivers_uuid_idx            ON drivers(uuid);
			CREATE UNIQUE INDEX IF NOT EXISTS stages_uniq_name            ON stages(name);
			CREATE INDEX        IF NOT EXISTS fe_stage_tag_ts_idx         ON finish_events(stage_id, tag, timestamp);
			CREATE INDEX        IF NOT EXISTS gates_stage_idx             ON gates(stage_id);
			CREATE INDEX        IF NOT EXISTS gate_events_gate_tag_idx    ON gate_events(gate_id, tag, timestamp);
			CREATE INDEX        IF NOT EXISTS rally_results_rally_idx     ON rally_results(rally_id);
			CREATE INDEX        IF NOT EXISTS rally_results_driver_idx    ON rally_results(driver_uuid);
			CREATE INDEX        IF NOT EXISTS championship_rallies_champ  ON championship_rallies(championship_id);

			-- Seed default classes
			INSERT INTO classes (name) VALUES ('Group A'), ('Group B'), ('Group S')
				ON CONFLICT (name) DO NOTHING;
	`);
}
