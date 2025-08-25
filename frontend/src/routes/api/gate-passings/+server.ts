import type { RequestHandler } from './$types';
import { writeFile, appendFile, mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// Where to store the file on the server
const DATA_DIR = join(process.cwd(), 'var', 'data');
const FILENAME = 'gatePassings.ndjson';
const FILEPATH = join(DATA_DIR, FILENAME);

async function ensureFile() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await stat(FILEPATH);
  } catch {
    await writeFile(FILEPATH, ''); // create empty file
  }
}

export const GET: RequestHandler = async () => {
  try {
    await ensureFile();
    const text = await readFile(FILEPATH, 'utf-8');
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
    const body = await request.json();
    // Minimal validation
    if (!body || typeof body.gate_id !== 'string' || typeof body.ts !== 'string') {
      return new Response('Bad payload: expected { ts: ISO string, gate_id: string }', { status: 400 });
    }

    // Append one NDJSON line
    const line = JSON.stringify({ ts: body.ts, gate_id: body.gate_id }) + '\n';
    await appendFile(FILEPATH, line, 'utf8');

    return new Response(null, { status: 204 });
  } catch (err: any) {
    return new Response(`Write error: ${err?.message ?? err}`, { status: 500 });
  }
};

export const DELETE: RequestHandler = async () => {
  try {
    await ensureFile();
    await writeFile(FILEPATH, ''); // truncate
    return new Response(null, { status: 204 });
  } catch (err: any) {
    return new Response(`Truncate error: ${err?.message ?? err}`, { status: 500 });
  }
};
