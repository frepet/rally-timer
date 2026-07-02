import type { Sql } from '../db';

export async function runMigration(sql: Sql) {
	await sql.unsafe(`
		ALTER TABLE settings
			ADD COLUMN IF NOT EXISTS default_championship_id UUID
				REFERENCES championships(id) ON DELETE SET NULL;
	`);
}
