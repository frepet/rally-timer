import { error } from '@sveltejs/kit';
import { sql, type Sql } from './db';
import type { AppEvent, EventType } from '../domain/events';

export async function getEvent(id: number, tx: Sql = sql): Promise<AppEvent> {
	if (!Number.isSafeInteger(id) || id <= 0) throw error(400, 'Invalid event id');
	const [event] =
		tx === sql
			? await tx<AppEvent[]>`SELECT id,type,name,created_at,is_locked FROM events WHERE id=${id}`
			: await tx<
					AppEvent[]
				>`SELECT id,type,name,created_at,is_locked FROM events WHERE id=${id} FOR UPDATE`;
	if (!event) throw error(404, 'Event not found');
	return { ...event, created_at: Number(event.created_at) };
}

export async function requireEvent(url: URL, type?: EventType, tx: Sql = sql): Promise<AppEvent> {
	const event = await getEvent(Number(url.searchParams.get('event_id')), tx);
	if (type && event.type !== type) throw error(400, `Expected a ${type} event`);
	return event;
}

export async function requireMutableEvent(
	url: URL,
	type?: EventType,
	tx: Sql = sql
): Promise<AppEvent> {
	const event = await requireEvent(url, type, tx);
	if (event.is_locked) throw error(409, 'Event is locked');
	return event;
}

export async function requireStageEvent(
	stageId: number,
	mutable = false,
	tx: Sql = sql
): Promise<AppEvent> {
	const [stage] = await tx<
		{ event_id: number }[]
	>`SELECT event_id FROM stages WHERE id = ${stageId}`;
	if (!stage) throw error(404, 'Stage not found');
	const event = await getEvent(stage.event_id, tx);
	if (mutable && event.is_locked) throw error(409, 'Event is locked');
	return event;
}

export async function requireHeatEvent(
	heatId: number,
	mutable = false,
	tx: Sql = sql
): Promise<AppEvent> {
	const [heat] = await tx<
		{ event_id: number }[]
	>`SELECT event_id FROM rallycross_heats WHERE id = ${heatId}`;
	if (!heat) throw error(404, 'Heat not found');
	const event = await getEvent(heat.event_id, tx);
	if (mutable && event.is_locked) throw error(409, 'Event is locked');
	return event;
}
