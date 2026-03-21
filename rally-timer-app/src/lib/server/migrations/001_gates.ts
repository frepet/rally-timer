import { db } from '../db';

export function migrateToGates() {
	db.exec(`
		CREATE TABLE IF NOT EXISTS gates (
			id          TEXT PRIMARY KEY,
			name        TEXT,
			last_seen   INTEGER NOT NULL,
			stage_id    INTEGER,
			created_at  INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS gates_stage_idx ON gates(stage_id);

		CREATE TABLE IF NOT EXISTS gate_events (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			gate_id    TEXT    NOT NULL,
			tag        TEXT    NOT NULL,
			timestamp  INTEGER NOT NULL,
			rssi       INTEGER,
			synced_at  INTEGER NOT NULL,
			FOREIGN KEY (gate_id) REFERENCES gates(id) ON DELETE CASCADE
		);
		CREATE INDEX IF NOT EXISTS gate_events_gate_tag_idx ON gate_events(gate_id, tag, timestamp);
	`);
}

export function needsMigration(): boolean {
	try {
		db.prepare('SELECT 1 FROM gates LIMIT 1').get();
		return false;
	} catch {
		return true;
	}
}
