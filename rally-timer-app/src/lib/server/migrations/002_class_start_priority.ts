import type { Sql } from '../db';

export async function runMigration(sql: Sql) {
	await sql.unsafe(`
		ALTER TABLE classes ADD COLUMN IF NOT EXISTS start_priority INTEGER NOT NULL DEFAULT 0;
	`);
}
