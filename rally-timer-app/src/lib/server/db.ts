import postgres from 'postgres';
import { env } from '$env/dynamic/private';

declare global {
	// eslint-disable-next-line no-var
	var __pgSql__: ReturnType<typeof postgres> | undefined;
}

const sql = globalThis.__pgSql__ ?? postgres(env.DATABASE_URL);
if (!globalThis.__pgSql__) globalThis.__pgSql__ = sql;

export { sql };

import { runMigration as run000 } from './migrations/000_initial_schema';
import { runMigration as run001 } from './migrations/001_class_crud';
import { runMigration as run002 } from './migrations/002_class_start_priority';
import { runMigration as run003 } from './migrations/003_pages';

export async function runMigrations() {
	await run000();
	await run001();
	await run002();
	await run003();
}

export const migrationsReady = runMigrations().catch((e) => {
	console.error('Migration failed, crashing:', e);
	process.exit(1);
});
