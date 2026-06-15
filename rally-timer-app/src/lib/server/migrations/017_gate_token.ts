import type { Sql } from '../db';

export async function runMigration(sql: Sql) {
	await sql.unsafe(`
		ALTER TABLE gates ADD COLUMN IF NOT EXISTS token TEXT;
	`);
}
