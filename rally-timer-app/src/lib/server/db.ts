import postgres from 'postgres';
import { env } from '$env/dynamic/private';

type Sql = ReturnType<typeof postgres>;

declare global {
	var __pgSql__: Sql | undefined;
}

function getSql(): Sql {
	if (!globalThis.__pgSql__) {
		if (!env.DATABASE_URL) {
			throw new Error('DATABASE_URL environment variable is required');
		}
		globalThis.__pgSql__ = postgres(env.DATABASE_URL);
	}
	return globalThis.__pgSql__;
}

// Lazy proxy: importing this module (e.g. during SvelteKit's build-time route
// analysis) must not require a database connection, but the first actual query
// fails fast with a clear error when DATABASE_URL is missing.
export const sql: Sql = new Proxy((() => {}) as unknown as Sql, {
	apply(_target, thisArg, args) {
		return Reflect.apply(getSql() as unknown as (...a: unknown[]) => unknown, thisArg, args);
	},
	get(_target, prop) {
		const real = getSql();
		const value = Reflect.get(real as object, prop, real);
		return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(real) : value;
	}
});

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
import { runMigration as run012 } from './migrations/012_training';
import { runMigration as run013 } from './migrations/013_settings';
import { runMigration as run014 } from './migrations/014_driver_rating';
import { runMigration as run015 } from './migrations/015_stage_order';

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
	await run012();
	await run013();
	await run014();
	await run015();
}
