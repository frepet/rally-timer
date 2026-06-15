import type { Sql } from '../db';

export async function runMigration(sql: Sql) {
	await sql.unsafe(`
		CREATE TABLE IF NOT EXISTS settings (
			id          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
			pinned_view TEXT CHECK (pinned_view IN ('rally', 'rallycross', 'training'))
		);

		INSERT INTO settings (id) VALUES (1)
			ON CONFLICT (id) DO NOTHING;
	`);
}
