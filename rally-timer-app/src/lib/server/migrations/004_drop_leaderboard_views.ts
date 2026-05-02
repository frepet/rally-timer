import { sql } from '../db';

export async function runMigration() {
	await sql.unsafe(`
		DROP VIEW IF EXISTS rally_leaderboard;
		DROP VIEW IF EXISTS stage_leaderboard;
	`);
}
