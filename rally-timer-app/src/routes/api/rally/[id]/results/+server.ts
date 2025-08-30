import { json } from '@sveltejs/kit';
import Database from 'better-sqlite3';

const db = new Database('database.sqlite', { fileMustExist: true });

export async function GET({ params }) {
	const rallyId = Number(params.id);
	db.pragma('journal_mode = WAL');
	const rows = db
		.prepare(
			`
    SELECT driver_id, driver_name, class_name, total_ms, finished_stages
    FROM rally_times
    WHERE rally_id = ?
    ORDER BY total_ms ASC;
  `
		)
		.all(rallyId);
	return json(rows);
}
