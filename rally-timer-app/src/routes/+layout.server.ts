import { sql } from '$lib/server/db'

export async function load() {
	const [row] = await sql`SELECT content FROM pages WHERE slug = 'title'`
	return { title: row?.content as string ?? 'Rally Timer' }
}
