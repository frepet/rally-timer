import type { PageLoad } from '$types';
import type { DriverType } from '../../lib/types';

export const load: PageLoad = async ({ fetch }) => {
	const response = await fetch('/api/driver');
	const drivers = (await response.json()) as DriverType[];
	return { drivers };
};
