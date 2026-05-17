import postgres from 'postgres';
import { env } from '$env/dynamic/private';

declare global {
	var __pgSql__: ReturnType<typeof postgres> | undefined;
}

const sql = globalThis.__pgSql__ ?? postgres(env.DATABASE_URL);
if (!globalThis.__pgSql__) globalThis.__pgSql__ = sql;

export { sql };

import { runMigration as run000 } from './migrations/000_initial_schema';
import { runMigration as run001 } from './migrations/001_class_crud';
import { runMigration as run002 } from './migrations/002_class_start_priority';
import { runMigration as run003 } from './migrations/003_pages';
import { runMigration as run004 } from './migrations/004_drop_leaderboard_views';
import { runMigration as run005 } from './migrations/005_stage_is_closed';
import { runMigration as run006 } from './migrations/006_finish_events_penalty';
import { runMigration as run007 } from './migrations/007_rallycross';
import { runMigration as run008 } from './migrations/008_rallycross_heats';
import { runMigration as run009 } from './migrations/009_rallycross_manual_position';
import { runMigration as run010 } from './migrations/010_rx_best_lap_in_submission';
import { runMigration as run011 } from './migrations/011_gate_events_unique_timestamp';

export async function runMigrations() {
	await run000();
	await run001();
	await run002();
	await run003();
	await run004();
	await run005();
	await run006();
	await run007();
	await run008();
	await run009();
	await run010();
	await run011();
}

export const migrationsReady = runMigrations().catch((e) => {
	console.error('Migration failed, crashing:', e);
	process.exit(1);
});
