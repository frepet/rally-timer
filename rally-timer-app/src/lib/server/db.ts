import postgres from 'postgres';
import { env } from '$env/dynamic/private';

export type Sql = ReturnType<typeof postgres>;

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
import { runMigration as run016 } from './migrations/016_drop_stage_time_views';
import { runMigration as run017 } from './migrations/017_gate_token';
import { runMigration as run018 } from './migrations/018_finish_events_dnf_unique';
import { runMigration as run019 } from './migrations/019_gate_enrollment';

const MIGRATIONS: Array<[name: string, run: (tx: Sql) => Promise<void>]> = [
	['000_initial_schema', run000],
	['001_class_crud', run001],
	['002_class_start_priority', run002],
	['003_pages', run003],
	['004_drop_leaderboard_views', run004],
	['005_stage_is_closed', run005],
	['006_finish_events_penalty', run006],
	['007_rallycross', run007],
	['008_rallycross_heats', run008],
	['009_rallycross_manual_position', run009],
	['010_rx_best_lap_in_submission', run010],
	['011_gate_events_unique_timestamp', run011],
	['012_training', run012],
	['013_settings', run013],
	['014_driver_rating', run014],
	['015_stage_order', run015],
	['016_drop_stage_time_views', run016],
	['017_gate_token', run017],
	['018_finish_events_dnf_unique', run018],
	['019_gate_enrollment', run019]
];

const MIGRATION_LOCK_ID = 72727201;

export async function runMigrations(): Promise<void> {
	await sql.begin(async (tx) => {
		// TransactionSql loses call signatures via Omit<> — cast to the outer sql type
		const tsql = tx as unknown as Sql;
		// Serialise across replicas: concurrent pods during a rolling deploy
		// must never run DDL at the same time. The transaction-scoped advisory
		// lock is released automatically when this transaction ends.
		await tsql`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_ID})`;
		await tsql.unsafe(`
			CREATE TABLE IF NOT EXISTS schema_migrations (
				name       TEXT   PRIMARY KEY,
				applied_at BIGINT NOT NULL
			)
		`);
		const rows = await tsql<{ name: string }[]>`SELECT name FROM schema_migrations`;
		const applied = new Set(rows.map((r) => r.name));
		for (const [name, run] of MIGRATIONS) {
			if (applied.has(name)) continue;
			// Run the migration's DDL on the SAME locked transaction connection,
			// so it is both serialised by the advisory lock and atomic with the
			// schema_migrations insert that records it.
			await run(tsql);
			await tsql`INSERT INTO schema_migrations (name, applied_at) VALUES (${name}, ${Date.now()})`;
		}
	});
}
