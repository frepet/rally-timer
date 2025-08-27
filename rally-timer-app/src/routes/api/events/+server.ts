import type { RequestHandler } from './$types';
import { mkdir, readFile, appendFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const DATA_DIR = join(process.cwd(), 'var', 'data');
const FILEPATH = join(DATA_DIR, 'events.ndjson');

// Basic shape your store expects (loosely typed here)
type ISODateString = string;
interface BaseEvent {
  id?: string;
  ts: ISODateString;
  src: string;
  type: string;
  payload?: unknown;
  recv_ts?: ISODateString;
}

async function ensureFile() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await stat(FILEPATH);
  } catch {
    await writeFile(FILEPATH, '');
  }
}

function isNonEmptyString(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0;
}

export const GET: RequestHandler = async () => {
  try {
    await ensureFile();
    const text = await readFile(FILEPATH, 'utf8'); // return as text to satisfy TS Response BodyInit
    return new Response(text, {
      status: 200,
      headers: { 'content-type': 'application/x-ndjson; charset=utf-8' }
    });
  } catch (err: any) {
    return new Response(`Read error: ${err?.message ?? err}`, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    await ensureFile();
    const body = (await request.json()) as Partial<BaseEvent>;

    // Minimal validation (keep generic)
    if (!isNonEmptyString(body?.ts) || !isNonEmptyString(body?.src) || !isNonEmptyString(body?.type)) {
      return new Response('Bad payload: expected { ts, src, type } strings', { status: 400 });
    }

    const saved: BaseEvent = {
      id: body.id && isNonEmptyString(body.id) ? body.id : randomUUID(),
      ts: body.ts,
      src: body.src,
      type: body.type,
      payload: body.payload ?? undefined,
      recv_ts: new Date().toISOString()
    };

    const line = JSON.stringify(saved) + '\n';
    await appendFile(FILEPATH, line, 'utf8');

    // Return JSON so the client can reconcile provisional ids
    return new Response(JSON.stringify(saved), {
      status: 201,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  } catch (err: any) {
    return new Response(`Write error: ${err?.message ?? err}`, { status: 500 });
  }
};

export const DELETE: RequestHandler = async () => {
  try {
    await ensureFile();
    await writeFile(FILEPATH, '', 'utf8'); // truncate file
    return new Response(null, { status: 204 });
  } catch (err: any) {
    return new Response(`Truncate error: ${err?.message ?? err}`, { status: 500 });
  }
};
