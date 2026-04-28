import { sql } from '../db';

export async function runMigration() {
	await sql.unsafe(`
		ALTER TABLE classes ADD COLUMN IF NOT EXISTS start_priority INTEGER NOT NULL DEFAULT 0;
	`);
}
