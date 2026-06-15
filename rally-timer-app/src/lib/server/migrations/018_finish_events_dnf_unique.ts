import type { Sql } from '../db';

export async function runMigration(sql: Sql) {
	// At most one synthetic DNF finish per (stage, tag). Without this, two
	// concurrent stage-close requests both pass the "does a synthetic finish
	// already exist?" check and each insert one, duplicating the DNF row.
	// Dedupe any existing duplicates (keep the lowest id) before adding the
	// constraint so the index creation cannot fail on legacy data.
	await sql.unsafe(`
		DELETE FROM finish_events
		WHERE dnf = true AND id NOT IN (
			SELECT MIN(id) FROM finish_events WHERE dnf = true GROUP BY stage_id, tag
		);

		CREATE UNIQUE INDEX IF NOT EXISTS finish_events_synthetic_dnf_unique
			ON finish_events (stage_id, tag) WHERE dnf;
	`);
}
