import { sql } from '../db';

export async function runMigration() {
	await sql.unsafe(`
		ALTER TABLE gates ADD COLUMN IF NOT EXISTS token TEXT;
	`);
}
