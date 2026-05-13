import { sql } from '../db';

export async function runMigration() {
	await sql.unsafe(`
		ALTER TABLE rallycross_heat_entries
			ADD COLUMN IF NOT EXISTS manual_position INTEGER;
	`);
}
