import type { Sql } from '../db';

export async function runMigration(sql: Sql) {
	await sql.unsafe(`
		ALTER TABLE finish_events
		ADD COLUMN IF NOT EXISTS penalty_ms BIGINT NOT NULL DEFAULT 0
	`);
}
