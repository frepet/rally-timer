import type { Sql } from '../db';

export async function runMigration(sql: Sql) {
	await sql.unsafe(`
		ALTER TABLE gates ADD COLUMN IF NOT EXISTS public_key TEXT;
		ALTER TABLE gates ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'accepted';
	`);
}
