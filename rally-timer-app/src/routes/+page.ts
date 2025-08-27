import type { PageLoad } from '$types';
import type { PassingType } from '../lib/types';

export const load: PageLoad = async ({ fetch }) => {
  let response = await fetch('/api/gate');
  let passings = await response.json() as PassingType[];
  return { passings };
}
