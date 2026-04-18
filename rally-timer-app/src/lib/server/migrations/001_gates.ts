import { sql } from '../db';

export async function runMigration() {
	await sql.begin(async (tx) => {
		const [row] = await tx`
			SELECT 1 FROM information_schema.tables
			WHERE table_schema = 'public' AND table_name = 'gates'
		`;

		if (!row) {
			await tx.unsafe(`
				CREATE TABLE IF NOT EXISTS gates (
					id          TEXT   PRIMARY KEY,
					name        TEXT,
					last_seen   BIGINT NOT NULL,
					stage_id    INTEGER,
					created_at  BIGINT NOT NULL
				);
				CREATE INDEX IF NOT EXISTS gates_stage_idx ON gates(stage_id);

				CREATE TABLE IF NOT EXISTS gate_events (
					id        SERIAL  PRIMARY KEY,
					gate_id   TEXT    NOT NULL,
					tag       TEXT    NOT NULL,
					timestamp BIGINT  NOT NULL,
					rssi      INTEGER,
					synced_at BIGINT  NOT NULL,
					FOREIGN KEY (gate_id) REFERENCES gates(id) ON DELETE CASCADE
				);
				CREATE INDEX IF NOT EXISTS gate_events_gate_tag_idx ON gate_events(gate_id, tag, timestamp);
			`);
		} else {
			// Fix column types if tables were created with INTEGER instead of BIGINT
			await tx.unsafe(`
				ALTER TABLE gates       ALTER COLUMN last_seen  TYPE BIGINT;
				ALTER TABLE gates       ALTER COLUMN created_at TYPE BIGINT;
				ALTER TABLE gate_events ALTER COLUMN timestamp  TYPE BIGINT;
				ALTER TABLE gate_events ALTER COLUMN synced_at  TYPE BIGINT;
			`);
		}
	});
}
