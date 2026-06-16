import type { Sql } from '../db';

export async function runMigration(sql: Sql) {
	await sql.unsafe(`
		ALTER TABLE gates DROP COLUMN IF EXISTS token;
	`);
}
