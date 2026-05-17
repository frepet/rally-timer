import { sql } from '../db';

export async function runMigration() {
	// Remove duplicate gate events (same gate, tag, timestamp) keeping only the lowest id.
	await sql.unsafe(`
		DELETE FROM gate_events
		WHERE id NOT IN (
			SELECT MIN(id) FROM gate_events GROUP BY gate_id, tag, timestamp
		);

		CREATE UNIQUE INDEX IF NOT EXISTS gate_events_unique_pass
			ON gate_events (gate_id, tag, timestamp);
	`);
}
