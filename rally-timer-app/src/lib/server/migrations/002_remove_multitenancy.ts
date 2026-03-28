import { sql } from '../db';

export async function runMigration() {
	await sql.unsafe(`
		DROP VIEW IF EXISTS rally_leaderboard;
		DROP VIEW IF EXISTS stage_leaderboard;
		DROP VIEW IF EXISTS rally_times;
		DROP VIEW IF EXISTS stage_times;

		DROP INDEX  IF EXISTS stages_uniq_per_rally;
		ALTER TABLE stages DROP COLUMN IF EXISTS rally_id;
		CREATE UNIQUE INDEX IF NOT EXISTS stages_uniq_name ON stages(name);

		DROP TABLE IF EXISTS rally_drivers;
		DROP TABLE IF EXISTS rallies;

		ALTER TABLE drivers ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

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
}
