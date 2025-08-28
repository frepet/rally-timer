import type { PageLoad } from '$types';
import type { BlipEventType } from '../../lib/types';


export const load: PageLoad = async ({ fetch }) => {
  let response = await fetch('/api/blip');
  let blipEvents = await response.json() as BlipEventType[];
  return { blipEvents: blipEvents };
}
