import type { Sql } from '../db';

// Finishing position within the heat, so a submitted rallycross heat keeps its
// exact order (DNFs are ranked by laps, which the stored rows cannot express).
export async function runMigration(sql: Sql) {
	await sql.unsafe(`
		ALTER TABLE rally_results ADD COLUMN IF NOT EXISTS heat_position INTEGER;
	`);
}
