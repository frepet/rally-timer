import type { Sql } from '../db';

export async function runMigration(sql: Sql) {
	await sql.unsafe(`
		CREATE INDEX IF NOT EXISTS start_events_stage_ts_idx
			ON start_events (stage_id, ts_ms);
	`);
}
