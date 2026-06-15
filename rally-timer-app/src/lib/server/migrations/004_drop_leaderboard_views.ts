import type { Sql } from '../db';

export async function runMigration(sql: Sql) {
	await sql.unsafe(`
		DROP VIEW IF EXISTS rally_leaderboard;
		DROP VIEW IF EXISTS stage_leaderboard;
	`);
}
