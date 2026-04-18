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

export async function runMigrations() {
	await run000();
}

export const migrationsReady = runMigrations().catch((e) => {
	console.error('Migration failed, crashing:', e);
	process.exit(1);
});
