import { sql } from '../db';

export async function runMigration() {
	await sql.begin(async (tx) => {
		await tx.unsafe(`
			ALTER TABLE drivers ADD COLUMN IF NOT EXISTS rating INTEGER NOT NULL DEFAULT 1500;

			CREATE TABLE IF NOT EXISTS rally_driver_ratings (
				rally_id      UUID    NOT NULL REFERENCES submitted_rallies(id) ON DELETE CASCADE,
				driver_uuid   UUID    NOT NULL,
				rating_before INTEGER NOT NULL,
				rating_after  INTEGER NOT NULL,
				PRIMARY KEY (rally_id, driver_uuid)
			);

			CREATE INDEX IF NOT EXISTS rally_driver_ratings_driver_idx ON rally_driver_ratings(driver_uuid);
		`);
	});
}
