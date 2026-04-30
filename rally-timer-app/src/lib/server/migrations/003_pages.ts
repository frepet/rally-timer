import { sql } from '../db';

export async function runMigration() {
	await sql.unsafe(`
		CREATE TABLE IF NOT EXISTS pages (
			slug TEXT PRIMARY KEY,
			content TEXT NOT NULL,
			updated_at BIGINT NOT NULL DEFAULT 0
		);
	`);

	await sql.unsafe(`
		INSERT INTO pages (slug, content) VALUES
			('rules', 'EDIT ME'),
			('about', 'EDIT ME')
		ON CONFLICT (slug) DO NOTHING;
	`);
}
