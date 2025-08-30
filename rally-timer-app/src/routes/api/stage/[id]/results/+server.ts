import { json } from '@sveltejs/kit';
import Database from 'better-sqlite3';

const db = new Database('database.sqlite', { fileMustExist: true });

export async function GET({ params }) {
	const stageId = Number(params.id);
	db.pragma('journal_mode = WAL');
	const rows = db
		.prepare(
			`
    SELECT driver_id, driver_name, class_name, start_ms, finish_ms, elapsed_ms
    FROM stage_times
    WHERE stage_id = ?
    ORDER BY elapsed_ms ASC;
  `
		)
		.all(stageId);
	return json(rows);
}
