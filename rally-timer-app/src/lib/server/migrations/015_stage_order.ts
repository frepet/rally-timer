import { sql } from '../db';

export async function runMigration() {
	await sql.unsafe(`
		ALTER TABLE rally_results ADD COLUMN IF NOT EXISTS stage_order INTEGER NOT NULL DEFAULT 0;
	`);
}
