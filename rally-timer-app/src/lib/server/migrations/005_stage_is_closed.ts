import type { Sql } from '../db';

export async function runMigration(sql: Sql) {
	await sql.unsafe(`
		ALTER TABLE stages ADD COLUMN IF NOT EXISTS is_closed BOOLEAN NOT NULL DEFAULT false;
	`);
}
