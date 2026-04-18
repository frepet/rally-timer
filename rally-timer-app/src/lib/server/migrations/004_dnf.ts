import { sql } from '../db';

export async function runMigration() {
	await sql.begin(async (tx) => { await tx.unsafe(`
		ALTER TABLE finish_events  ADD COLUMN IF NOT EXISTS dnf BOOLEAN NOT NULL DEFAULT FALSE;
		ALTER TABLE rally_results  ADD COLUMN IF NOT EXISTS dnf BOOLEAN NOT NULL DEFAULT FALSE;
	`); });
}
