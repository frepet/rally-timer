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
import { runMigration as run001 } from './migrations/001_gates';
import { runMigration as run002 } from './migrations/002_remove_multitenancy';
import { runMigration as run003 } from './migrations/003_championships';

export async function runMigrations() {
	await run000();
	await run001();
	await run002();
	await run003();
}

export const migrationsReady = runMigrations().catch((e) => {
	console.error('Migration failed:', e);
});
