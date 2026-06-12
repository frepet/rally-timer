import type { Handle } from '@sveltejs/kit';

import { runMigrations } from '$lib/server/db';

// Started lazily on the first request (not at module import) so that building
// the app never requires a database. All requests wait for migrations.
let migrationsReady: Promise<void> | undefined;

export const handle: Handle = async ({ event, resolve }) => {
	migrationsReady ??= runMigrations().catch((e) => {
		console.error('Migration failed, crashing:', e);
		process.exit(1);
	});
	await migrationsReady;
	return resolve(event);
};
