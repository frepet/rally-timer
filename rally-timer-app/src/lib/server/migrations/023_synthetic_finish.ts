import type { Sql } from '../db';

export async function runMigration(sql: Sql) {
	await sql.unsafe(`
		ALTER TABLE finish_events ADD COLUMN IF NOT EXISTS synthetic BOOLEAN NOT NULL DEFAULT false;
		ALTER TABLE rally_results ADD COLUMN IF NOT EXISTS synthetic BOOLEAN NOT NULL DEFAULT false;
	`);
}
