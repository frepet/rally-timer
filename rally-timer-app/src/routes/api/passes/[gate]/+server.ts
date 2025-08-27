import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR ?? path.resolve('data');

export const GET: RequestHandler = async ({ params }) => {
  const gate = params.gate!;
  const today = new Date();
  const y = today.getUTCFullYear();
  const m = String(today.getUTCMonth() + 1).padStart(2, '0');
  const d = String(today.getUTCDate()).padStart(2, '0');

  const file = path.join(DATA_DIR, 'gates', gate, `pass-${y}${m}${d}.ndjson`);

  let items: unknown[] = [];
  try {
    const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    items = text
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (e) {
    console.error('[snapshot] read/parse error', e);
  }

  return new Response(JSON.stringify(items), {
    headers: { 'content-type': 'application/json' }
  });
};
