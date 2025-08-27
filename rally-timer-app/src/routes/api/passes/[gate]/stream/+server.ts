import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR ?? path.resolve('data');

function yyyyMMddUTC(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${da}`;
}

export const GET: RequestHandler = async ({ params }) => {
  const gate = params.gate!;
  const file = path.join(DATA_DIR, 'gates', gate, `pass-${yyyyMMddUTC()}.ndjson`);

  let position = 0;

  // Start at current end-of-file (so we only stream future appends)
  try {
    const stat = fs.existsSync(file) ? fs.statSync(file) : null;
    position = stat ? stat.size : 0;
  } catch { /* ignore */ }

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode('retry: 2000\n' + 'event: ready\ndata: ok\n\n')
      );

      const timer = setInterval(() => {
        try {
          if (!fs.existsSync(file)) return;

          const stat = fs.statSync(file);
          if (stat.size > position) {
            const fd = fs.openSync(file, 'r');
            const buf = Buffer.alloc(stat.size - position);
            fs.readSync(fd, buf, 0, buf.length, position);
            fs.closeSync(fd);
            position = stat.size;

            // Split new chunk on newlines and emit each line
            const lines = buf.toString('utf8').split('\n').filter(Boolean);
            for (const line of lines) {
              controller.enqueue(new TextEncoder().encode(`data: ${line}\n\n`));
            }
          }
        } catch (e) {
          controller.enqueue(new TextEncoder().encode(`event: error\ndata: ${String(e)}\n\n`));
        }
      }, 500);

      // cleanup
      const close = () => clearInterval(timer);
      // @ts-expect-error private but works in runtime to detect close
      controller._onClose = close;
    },
    cancel() {
      // @ts-expect-error see above
      if (typeof this._onClose === 'function') this._onClose();
    }
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive'
    }
  });
};
