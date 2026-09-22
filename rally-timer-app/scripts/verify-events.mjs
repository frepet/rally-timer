/** Real PostgreSQL + HTTP regression checks. Never connects to the caller's database. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { readdir } from 'node:fs/promises';
import net from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import postgres from 'postgres';

const root = fileURLToPath(new URL('..', import.meta.url));
const container = `rally-events-test-${randomUUID()}`;
const password = randomUUID();
let server;
let logs = '';
let db;
let fresh;
let cleaning;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const docker = (...args) =>
	execFileSync('docker', args, { encoding: 'utf8', timeout: 120000, maxBuffer: 128 * 1024 }).trim();
async function cleanup() {
	if (cleaning) return cleaning;
	cleaning = (async () => {
		if (server && server.exitCode === null) {
			server.kill('SIGTERM');
			await Promise.race([once(server, 'exit'), sleep(2000)]);
			if (server.exitCode === null) server.kill('SIGKILL');
		}
		await Promise.allSettled([db?.end({ timeout: 2 }), fresh?.end({ timeout: 2 })]);
		try {
			docker('rm', '-f', container);
		} catch {
			/* Container may not have started. */
		}
	})();
	return cleaning;
}
for (const signal of ['SIGINT', 'SIGTERM'])
	process.once(signal, () => void cleanup().finally(() => process.exit(130)));
async function waitFor(check, label, timeout = 60000) {
	const deadline = Date.now() + timeout;
	let last;
	while (Date.now() < deadline) {
		try {
			if (await check()) return;
		} catch (error) {
			last = error;
		}
		await sleep(150);
	}
	throw new Error(`Timed out waiting for ${label}: ${last?.message ?? ''}`);
}
async function freePort() {
	const socket = net.createServer();
	socket.listen(0, '127.0.0.1');
	await once(socket, 'listening');
	const port = socket.address().port;
	await new Promise((resolve, reject) =>
		socket.close((error) => (error ? reject(error) : resolve()))
	);
	return port;
}
const migrationDir = path.join(root, 'src/lib/server/migrations');
const names = (await readdir(migrationDir)).filter((name) => /^\d{3}.*\.ts$/.test(name)).sort();
async function apply(db, files) {
	await db`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at BIGINT NOT NULL)`;
	for (const filename of files) {
		const { runMigration } = await import(pathToFileURL(path.join(migrationDir, filename)).href);
		await db.begin(async (tx) => {
			await runMigration(tx);
			await tx`INSERT INTO schema_migrations(name,applied_at) VALUES (${filename.slice(0, -3)},${Date.now()}) ON CONFLICT DO NOTHING`;
		});
	}
}
try {
	console.log('Starting disposable PostgreSQL (Docker postgres:16-alpine)…');
	docker(
		'run',
		'--detach',
		'--rm',
		'--name',
		container,
		'--publish',
		'127.0.0.1::5432',
		'--env',
		`POSTGRES_PASSWORD=${password}`,
		'postgres:16-alpine'
	);
	const port = Number(docker('port', container, '5432/tcp').split(':').at(-1));
	assert(Number.isInteger(port) && port > 0);
	const databaseUrl = `postgres://postgres:${password}@127.0.0.1:${port}/postgres`;
	db = postgres(databaseUrl, { onnotice: () => {}, connect_timeout: 2 });
	await waitFor(async () => {
		await db`SELECT 1`;
		return true;
	}, 'PostgreSQL');
	await db`CREATE DATABASE fresh_events`;
	fresh = postgres(`postgres://postgres:${password}@127.0.0.1:${port}/fresh_events`, {
		onnotice: () => {}
	});
	await apply(fresh, names);
	assert.equal(
		(await fresh`SELECT id FROM events`).length,
		3,
		'fresh install creates migrated workspaces'
	);
	console.log('PASS fresh migrations');
	await apply(
		db,
		names.filter((name) => Number(name.slice(0, 3)) < 24)
	);
	const [classA, classB] = await db`SELECT id FROM classes ORDER BY id`;
	const [driverA, driverB] =
		await db`INSERT INTO drivers(name,class_id,tag,rating) VALUES ('Legacy A',${classA.id},'LEGACY-A',1234),('Legacy B',${classB.id},'LEGACY-B',1456) RETURNING id,uuid`;
	const [legacyStage] = await db`INSERT INTO stages(name) VALUES ('Legacy SS1') RETURNING id`;
	const gate1 = randomUUID(),
		gate2 = randomUUID();
	await db`INSERT INTO gates(id,name,last_seen,created_at,stage_id) VALUES (${gate1},'Gate 1',${Date.now()},${Date.now()},${legacyStage.id}),(${gate2},'Gate 2',${Date.now()},${Date.now()},NULL)`;
	await db`UPDATE rallycross SET gate_id=${gate2},started_at=1000`;
	await db`UPDATE training SET gate_id=${gate2},started_at=1000`;
	await db`INSERT INTO gate_events(gate_id,tag,timestamp,synced_at) VALUES (${gate2},'LEGACY-A',2000,2000),(${gate2},'LEGACY-A',4000,4000)`;
	await db`UPDATE settings SET pinned_view='training'`;
	const [champ] =
		await db`INSERT INTO championships(name,created_at) VALUES ('Verification Cup',1000) RETURNING id`;
	const [snapshot] =
		await db`INSERT INTO submitted_rallies(name,submitted_at) VALUES ('Legacy snapshot',1000) RETURNING id`;
	await db`INSERT INTO championship_rallies(championship_id,rally_id) VALUES (${champ.id},${snapshot.id})`;
	await db`INSERT INTO rally_results(rally_id,driver_uuid,driver_name,class_id,class_name,stage_name,elapsed_ms) VALUES (${snapshot.id},${driverA.uuid},'Legacy A',${classA.id},'Group A','Legacy SS1',3000)`;
	await apply(
		db,
		names.filter((name) => Number(name.slice(0, 3)) >= 24)
	);
	const migrated = await db`SELECT * FROM events ORDER BY id`;
	assert.equal(migrated.length, 3);
	assert.equal((await db`SELECT * FROM event_participants`).length, 6);
	assert.equal((await db`SELECT * FROM gate_event_events`).length, 4);
	assert.equal((await db`SELECT * FROM gate_assignments`).length, 2);
	assert.equal(
		Number((await db`SELECT rating FROM drivers WHERE id=${driverA.id}`)[0].rating),
		1234
	);
	assert.equal(
		(await db`SELECT elapsed_ms FROM rally_results WHERE rally_id=${snapshot.id}`)[0].elapsed_ms,
		'3000'
	);
	const legacyTraining = migrated.find((e) => e.type === 'training');
	assert.equal(
		(await db`SELECT pinned_event_id FROM settings`)[0].pinned_event_id,
		legacyTraining.id
	);
	await db`DELETE FROM event_participants WHERE event_id=${legacyTraining.id} AND driver_id=${driverB.id}`;
	await db`UPDATE settings SET pinned_event_id=NULL`;
	await apply(
		db,
		names.filter((name) => name.startsWith('024_'))
	);
	assert.equal((await db`SELECT * FROM events`).length, 3);
	assert.equal(
		(await db`SELECT * FROM event_participants`).length,
		5,
		'replay preserves changed membership'
	);
	assert.equal(
		(await db`SELECT pinned_event_id FROM settings`)[0].pinned_event_id,
		null,
		'replay preserves unpin'
	);
	assert.equal(
		(await db`SELECT * FROM championship_rallies WHERE rally_id=${snapshot.id}`).length,
		1
	);
	console.log('PASS legacy migration, historical results/ratings and replay preservation');

	const httpPort = await freePort();
	const base = `http://127.0.0.1:${httpPort}`;
	server = spawn(
		process.execPath,
		[
			'node_modules/vite/bin/vite.js',
			'dev',
			'--host',
			'127.0.0.1',
			'--port',
			String(httpPort),
			'--strictPort'
		],
		{
			cwd: root,
			env: {
				...process.env,
				DATABASE_URL: databaseUrl,
				SKIP_AUTH: 'true',
				PUBLIC_SKIP_AUTH: 'true',
				NODE_ENV: 'development'
			},
			stdio: ['ignore', 'pipe', 'pipe']
		}
	);
	for (const stream of [server.stdout, server.stderr])
		stream.on('data', (chunk) => {
			logs = (logs + chunk).slice(-16000);
		});
	await waitFor(async () => {
		if (server.exitCode !== null) throw new Error(`Dev server exited ${server.exitCode}`);
		return (await fetch(`${base}/api/events`)).ok;
	}, 'dev server');
	async function request(method, url, body, expected = 200) {
		const response = await fetch(base + url, {
			method,
			headers: body === undefined ? {} : { 'content-type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body),
			signal: AbortSignal.timeout(15000)
		});
		const text = await response.text();
		assert.equal(response.status, expected, `${method} ${url}: ${text.slice(0, 1000)}`);
		return text ? JSON.parse(text) : null;
	}
	const get = (url) => request('GET', url);
	const create = (type, name) => request('POST', '/api/events', { type, name }, 201);
	const participants = (id, ids) =>
		request('PUT', `/api/events/${id}/participants`, { driver_ids: ids });
	const stage = (id, name) => request('POST', `/api/stage?event_id=${id}`, { name }, 201);
	const close = (id) => request('POST', `/api/stage/${id}/close`);
	const gate = (gate_id, stage_id) => request('PATCH', `/api/gate/${gate_id}`, { stage_id });
	const pass = (gate_id, timestamp_ms, tag = 'LEGACY-A') =>
		request('POST', '/api/gate-event', { gate_id, timestamp_ms, tag }, 201);
	const rxConfig = (id, body) => request('PATCH', `/api/rallycross?event_id=${id}`, body);
	// Release migrated claims through public APIs before testing reuse.
	await gate(gate1, null);
	await rxConfig(migrated.find((e) => e.type === 'rallycross').id, { gate_id: null });
	const a = await create('rally', 'Rally A'),
		b = await create('rally', 'Rally B');
	await participants(a.id, [driverA.id]);
	await participants(b.id, [driverA.id, driverB.id]);
	const a1 = await stage(a.id, 'SS1'),
		b1 = await stage(b.id, 'SS1'),
		a2 = await stage(a.id, 'SS2');
	assert.deepEqual(
		(await get(`/api/bundle?event_id=${a.id}`)).drivers.map((d) => d.id),
		[driverA.id]
	);
	assert.equal((await get(`/api/bundle?event_id=${b.id}`)).drivers.length, 2);
	assert.deepEqual(
		(await get(`/api/stage?event_id=${a.id}`)).map((s) => s.id),
		[a1.id, a2.id]
	);
	await request('GET', '/api/bundle', undefined, 400);
	await gate(gate1, a1.id);
	await request('POST', '/api/start', { stage_id: a1.id, driver_id: driverB.id }, 400);
	const start = Date.now();
	await request(
		'POST',
		'/api/start',
		{ stage_id: a1.id, driver_id: driverA.id, ts_ms: start },
		201
	);
	await sleep(3);
	await pass(gate1, Date.now());
	const closeA = await close(a1.id);
	assert.equal(closeA.gateMovedToStageId, a2.id, 'handover skips interleaved other-event stage');
	assert.equal((await get(`/api/stage?event_id=${b.id}`))[0].is_closed, false);
	assert.equal((await close(a2.id)).gateMovedToStageId, null, 'empty final stage releases gate');
	assert.equal((await get('/api/gate')).find((g) => g.id === gate1).assigned_event_id, null);
	console.log(
		'PASS independent participants/stages, invalid participant, scoped handover and empty-stage close'
	);

	const trainingA = await create('training', 'Training A'),
		trainingB = await create('training', 'Training B');
	for (const event of [trainingA, trainingB]) await participants(event.id, [driverA.id]);
	await request('PATCH', `/api/training?event_id=${trainingA.id}`, {
		gate_id: gate1,
		cooldown_ms: 0
	});
	await request('PATCH', `/api/training?event_id=${trainingB.id}`, { gate_id: gate1 }, 409);
	await request('PATCH', `/api/gate/${gate1}`, { stage_id: b1.id }, 409);
	await sleep(3);
	const firstPass = Date.now();
	await pass(gate1, firstPass);
	await sleep(3);
	const latePass = Date.now();
	await sleep(3);
	await request('PATCH', `/api/training?event_id=${trainingA.id}`, { gate_id: null });
	await request('PATCH', `/api/training?event_id=${trainingB.id}`, {
		gate_id: gate1,
		cooldown_ms: 0
	});
	await sleep(3);
	const newPass = Date.now();
	await pass(gate1, newPass);
	const synced = await request('POST', '/api/gate-sync', {
		events: [{ gate_id: gate1, tag: 'LEGACY-A', timestamp_ms: latePass }]
	});
	assert.equal(synced.stored, 1);
	const trA = await get(`/api/training?event_id=${trainingA.id}`),
		trB = await get(`/api/training?event_id=${trainingB.id}`);
	assert.equal(trA.drivers[0].lap_count, 1, 'late upload remains in original training');
	assert.equal(trA.drivers[0].last_pass_ms, latePass);
	assert.equal(trB.drivers[0].lap_count, 0, 'reused gate does not inherit old laps');
	assert.equal(trB.drivers[0].last_pass_ms, newPass);
	await request('PATCH', `/api/events/${trainingA.id}`, { is_locked: true }, 400);
	await request(
		'POST',
		`/api/submit-rally?event_id=${trainingA.id}`,
		{ name: 'Invalid', championship_ids: [champ.id] },
		400
	);
	await request('PATCH', `/api/training?event_id=${trainingB.id}`, { gate_id: null });
	console.log('PASS cross-mode exclusivity, saved training, late uploads and gate reuse');

	const submitBody = { name: 'Rally A result', championship_ids: [champ.id] };
	const statuses = await Promise.all(
		[1, 2].map(() =>
			fetch(`${base}/api/submit-rally?event_id=${a.id}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(submitBody)
			}).then((r) => r.status)
		)
	);
	assert.deepEqual(statuses.sort(), [201, 409], 'concurrent submit produces exactly one snapshot');
	await request('POST', `/api/stage?event_id=${a.id}`, { name: 'Blocked' }, 409);
	await request('DELETE', `/api/clear-rally?event_id=${a.id}`, undefined, 409);
	await request('PUT', `/api/events/${a.id}/participants`, { driver_ids: [] }, 409);
	assert.equal((await get(`/api/events/${a.id}`)).event.is_locked, true);
	assert.equal((await db`SELECT id FROM submitted_rallies WHERE event_id=${a.id}`).length, 1);
	await request('PATCH', `/api/events/${a.id}`, { is_locked: false });
	await request('POST', `/api/submit-rally?event_id=${a.id}`, submitBody, 201);
	assert.equal((await db`SELECT id FROM submitted_rallies WHERE event_id=${a.id}`).length, 2);
	assert.equal((await get(`/api/stage?event_id=${b.id}`)).length, 1);
	console.log('PASS atomic submit, lock guards and explicit unlock/resubmit');

	const rxA = await create('rallycross', 'RX A'),
		rxB = await create('rallycross', 'RX B');
	const ratingsBefore = await db`SELECT id,rating FROM drivers ORDER BY id`;
	const heatIds = [];
	for (const [event, gateId] of [
		[rxA, gate1],
		[rxB, gate2]
	]) {
		await participants(event.id, [driverA.id]);
		await rxConfig(event.id, { gate_id: gateId, cooldown_ms: 0, required_laps: 1 });
		const heat = await request(
			'POST',
			`/api/rallycross/heat?event_id=${event.id}`,
			{ driver_ids: [driverA.id] },
			201
		);
		heatIds.push(heat.id);
		await request('POST', `/api/rallycross/heat/${heat.id}/start`);
	}
	await sleep(3);
	await pass(gate1, Date.now());
	assert.notEqual((await get(`/api/rallycross?event_id=${rxA.id}`)).heats[0].closed_at, null);
	assert.equal((await get(`/api/rallycross?event_id=${rxB.id}`)).heats[0].closed_at, null);
	const board = await get(`/api/rallycross/leaderboard?event_id=${rxA.id}`);
	assert.equal(board.length, 1);
	await rxConfig(rxA.id, { gate_id: null });
	assert.deepEqual(
		await get(`/api/rallycross/leaderboard?event_id=${rxA.id}`),
		board,
		'release keeps completed RX results'
	);
	await request(
		'POST',
		`/api/rallycross/submit?event_id=${rxA.id}`,
		{ name: 'RX A result', championship_ids: [champ.id] },
		201
	);
	assert.equal((await get(`/api/events/${rxA.id}`)).event.is_locked, true);
	assert.deepEqual(
		Array.from(await db`SELECT id,rating FROM drivers ORDER BY id`),
		Array.from(ratingsBefore),
		'RX submission does not affect ratings'
	);
	assert.equal((await get(`/api/rallycross?event_id=${rxB.id}`)).active_heat.id, heatIds[1]);
	console.log(
		'PASS simultaneous RX, isolated auto-close, immutable history after gate release and unchanged ratings'
	);
	console.log('All event integration checks passed.');
} catch (error) {
	console.error(error);
	if (logs) console.error(`Dev server output (last 16000 characters):\n${logs}`);
	process.exitCode = 1;
} finally {
	await cleanup();
}
