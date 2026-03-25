import { sql } from '../db';

export async function runMigration() {
	const [row] = await sql`
		SELECT 1 FROM information_schema.tables
		WHERE table_schema = 'public' AND table_name = 'gates'
	`;
	if (row) return;

	await sql.unsafe(`
		CREATE TABLE IF NOT EXISTS gates (
			id          TEXT    PRIMARY KEY,
			name        TEXT,
			last_seen   INTEGER NOT NULL,
			stage_id    INTEGER,
			created_at  INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS gates_stage_idx ON gates(stage_id);

		CREATE TABLE IF NOT EXISTS gate_events (
			id        SERIAL  PRIMARY KEY,
			gate_id   TEXT    NOT NULL,
			tag       TEXT    NOT NULL,
			timestamp INTEGER NOT NULL,
			rssi      INTEGER,
			synced_at INTEGER NOT NULL,
			FOREIGN KEY (gate_id) REFERENCES gates(id) ON DELETE CASCADE
		);
		CREATE INDEX IF NOT EXISTS gate_events_gate_tag_idx ON gate_events(gate_id, tag, timestamp);
	`);
}
