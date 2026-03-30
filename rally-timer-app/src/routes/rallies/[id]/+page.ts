import { error } from '@sveltejs/kit'
import type { PageLoad } from './$types'

export const load: PageLoad = async ({ fetch, params }) => {
	const res = await fetch(`/api/submitted-rally/${params.id}`)
	if (!res.ok) throw error(res.status, 'Rally not found')
	return res.json()
}
