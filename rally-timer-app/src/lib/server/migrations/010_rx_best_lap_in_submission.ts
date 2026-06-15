import type { Sql } from '../db';

export async function runMigration(sql: Sql) {
	await sql.unsafe(`
		ALTER TABLE rally_results
			ADD COLUMN IF NOT EXISTS best_lap_ms BIGINT;
	`);
}
