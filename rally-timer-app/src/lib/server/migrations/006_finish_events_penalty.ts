import { sql } from '../db';

export async function runMigration() {
	await sql.unsafe(`
		ALTER TABLE finish_events
		ADD COLUMN IF NOT EXISTS penalty_ms BIGINT NOT NULL DEFAULT 0
	`);
}
