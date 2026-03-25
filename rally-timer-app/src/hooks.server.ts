import type { Handle } from '@sveltejs/kit';
import { migrationsReady } from '$lib/server/db';

export const handle: Handle = async ({ event, resolve }) => {
	await migrationsReady;
	return resolve(event);
};
