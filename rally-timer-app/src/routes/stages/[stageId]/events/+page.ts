import type { BundleResponse } from '../../../../lib/types';
import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageLoad = async ({ params, fetch }) => {
	const stageId = Number(params.stageId) || 0;
	if (!stageId) throw error(400, 'Invalid stage id');

	const bundle: BundleResponse = await fetch('/api/bundle').then((r) => r.json());

	return { stageId, bundle };
};
