import { error } from '@sveltejs/kit'
import { sql } from '$lib/server/db'
import { marked } from 'marked'

export async function load() {
	const [row] = await sql`SELECT content FROM pages WHERE slug = 'rules'`
	if (!row) throw error(404, 'Page not found')
	return {
		slug: 'rules',
		content: row.content as string,
		html: marked(row.content as string) as string
	}
}
