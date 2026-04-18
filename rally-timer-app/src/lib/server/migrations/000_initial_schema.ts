import { sql } from '../db';

export async function runMigration() {
	await sql.begin(async (tx) => {
		await tx.unsafe(`
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

			-- Views (CREATE OR REPLACE is always idempotent)
			CREATE OR REPLACE VIEW stage_times AS
			WITH next_start AS (
				SELECT
					se.id          AS start_id,
					MIN(se2.ts_ms) AS next_ts
				FROM start_events se
				LEFT JOIN start_events se2
					ON  se2.driver_id = se.driver_id
					AND se2.stage_id  = se.stage_id
					AND se2.ts_ms     > se.ts_ms
				GROUP BY se.id
			),
			finish AS (
				SELECT
					se.id             AS start_id,
					MIN(fe.timestamp) AS finish_ms
				FROM start_events se
				JOIN drivers d          ON d.id       = se.driver_id AND d.active = true
				LEFT JOIN next_start ns ON ns.start_id = se.id
				JOIN finish_events fe   ON fe.stage_id = se.stage_id
										AND fe.tag      = d.tag
										AND fe.timestamp >= se.ts_ms
										AND (ns.next_ts IS NULL OR fe.timestamp < ns.next_ts)
				GROUP BY se.id
			)
			SELECT
				se.stage_id,
				s.name      AS stage_name,
				se.driver_id,
				d.name      AS driver_name,
				d.tag       AS driver_tag,
				d.class_id,
				c.name      AS class_name,
				se.ts_ms    AS start_ms,
				f.finish_ms,
				CASE WHEN f.finish_ms IS NOT NULL THEN (f.finish_ms - se.ts_ms) END AS elapsed_ms
			FROM start_events se
			JOIN drivers d   ON d.id = se.driver_id AND d.active = true
			JOIN classes c   ON c.id = d.class_id
			JOIN stages  s   ON s.id = se.stage_id
			LEFT JOIN finish f ON f.start_id = se.id;

			CREATE OR REPLACE VIEW rally_times AS
			SELECT
				st.driver_id,
				st.driver_name,
				st.driver_tag,
				st.class_id,
				st.class_name,
				COUNT(st.elapsed_ms) AS finished_stages,
				SUM(st.elapsed_ms)   AS total_ms,
				MIN(st.start_ms)     AS first_start,
				MAX(st.finish_ms)    AS last_finish
			FROM stage_times st
			WHERE st.elapsed_ms IS NOT NULL
			GROUP BY st.driver_id, st.driver_name, st.driver_tag, st.class_id, st.class_name;

			CREATE OR REPLACE VIEW rally_leaderboard AS
			SELECT
				rt.driver_id,
				rt.driver_name,
				rt.driver_tag,
				rt.class_id,
				rt.class_name,
				rt.total_ms,
				rt.finished_stages,
				ROW_NUMBER() OVER (ORDER BY rt.total_ms ASC)                         AS position,
				ROW_NUMBER() OVER (PARTITION BY rt.class_id ORDER BY rt.total_ms ASC) AS class_position,
				rt.total_ms - MIN(rt.total_ms) OVER ()                                AS delta_p1,
				rt.total_ms - LAG(rt.total_ms) OVER (ORDER BY rt.total_ms ASC)        AS delta_prev
			FROM rally_times rt
			WHERE rt.total_ms IS NOT NULL;

			CREATE OR REPLACE VIEW stage_leaderboard AS
			SELECT
				st.stage_id,
				st.stage_name,
				st.driver_id,
				st.driver_name,
				st.driver_tag,
				st.class_id,
				st.class_name,
				st.elapsed_ms                AS stage_ms,
				ROW_NUMBER() OVER (PARTITION BY st.stage_id ORDER BY st.elapsed_ms ASC)                       AS position,
				st.elapsed_ms - MIN(st.elapsed_ms) OVER (PARTITION BY st.stage_id)                            AS delta_p1,
				st.elapsed_ms - LAG(st.elapsed_ms) OVER (PARTITION BY st.stage_id ORDER BY st.elapsed_ms ASC) AS delta_prev
			FROM stage_times st
			WHERE st.elapsed_ms IS NOT NULL;
		`);
	});
}
