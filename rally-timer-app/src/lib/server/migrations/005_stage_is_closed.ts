import { sql } from '../db';

export async function runMigration() {
	await sql.unsafe(`
		ALTER TABLE stages ADD COLUMN IF NOT EXISTS is_closed BOOLEAN NOT NULL DEFAULT false;
	`);
}
