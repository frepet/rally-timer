import { sql } from '../db';

export async function runMigration() {
	// Stage/rally timing is computed by the domain layer
	// (src/lib/domain/rallySubmission.ts); the SQL views duplicated that logic
	// (without penalty support) and have no remaining consumers.
	await sql.unsafe(`
		DROP VIEW IF EXISTS rally_times;
		DROP VIEW IF EXISTS stage_times;
	`);
}
