import type { Sql } from '../db';

export async function runMigration(sql: Sql) {
	await sql.unsafe(`
			-- Drop FK on rally_results.class_id so historical submitted rallies survive
			-- class deletion. class_name is already snapshotted on the row, mirroring
			-- the existing pattern for driver_uuid/driver_name and stage_name.
			ALTER TABLE rally_results DROP CONSTRAINT IF EXISTS rally_results_class_id_fkey;

			-- Change drivers.class_id ON DELETE from RESTRICT to CASCADE so deleting a
			-- class wipes its current drivers along with it.
			ALTER TABLE drivers DROP CONSTRAINT IF EXISTS drivers_class_id_fkey;
			ALTER TABLE drivers
				ADD CONSTRAINT drivers_class_id_fkey
				FOREIGN KEY (class_id) REFERENCES classes(id)
				ON UPDATE CASCADE ON DELETE CASCADE;

			-- Change start_events.driver_id ON DELETE from RESTRICT to CASCADE so the
			-- class -> drivers cascade above is not blocked by a driver's start events.
			ALTER TABLE start_events DROP CONSTRAINT IF EXISTS start_events_driver_id_fkey;
			ALTER TABLE start_events
				ADD CONSTRAINT start_events_driver_id_fkey
				FOREIGN KEY (driver_id) REFERENCES drivers(id)
				ON DELETE CASCADE;
	`);
}
