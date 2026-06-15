import type { Handle, HandleServerError } from '@sveltejs/kit';

import { runMigrations } from '$lib/server/db';
import { log } from '$lib/server/log';

// Started lazily on the first request (not at module import) so that building
// the app never requires a database. All requests wait for migrations.
let migrationsReady: Promise<void> | undefined;

export const handle: Handle = async ({ event, resolve }) => {
	migrationsReady ??= runMigrations().catch((e) => {
		log.error('Migration failed, crashing', { error: String(e) });
		process.exit(1);
	});
	await migrationsReady;
	return resolve(event);
};

// Sanitises unexpected (non-HttpError) failures: the full error is logged
// server-side with a correlation id, the client only sees a generic message
// so raw Postgres/internal details never leak in the response body.
export const handleError: HandleServerError = ({ error, event, status, message }) => {
	const id = crypto.randomUUID();
	log.error('Unhandled request error', {
		id,
		status,
		method: event.request.method,
		path: event.url.pathname,
		error: error instanceof Error ? error.stack : String(error)
	});
	return { message: status === 500 ? 'Internal error' : message, id };
};
