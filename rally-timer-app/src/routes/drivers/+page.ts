import type { PageLoad } from '$types';
import type { DriverType } from '../../lib/types';


export const load: PageLoad = async ({ fetch }) => {
  let response = await fetch('/api/driver');
  let drivers = await response.json() as DriverType[];
  return { drivers: drivers };
}
