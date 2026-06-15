import type { Sql } from '../db';

export async function runMigration(sql: Sql) {
	await sql.unsafe(`
		CREATE TABLE IF NOT EXISTS training (
			id          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
			gate_id     TEXT             REFERENCES gates(id) ON DELETE SET NULL,
			cooldown_ms INTEGER NOT NULL DEFAULT 10000 CHECK (cooldown_ms >= 0),
			started_at  BIGINT
		);

		INSERT INTO training (id, cooldown_ms) VALUES (1, 10000)
			ON CONFLICT (id) DO NOTHING;
	`);
}
