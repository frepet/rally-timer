import Database from 'better-sqlite3';
import { env } from '$env/dynamic/private'; // runtime env on the server

const dbFile = env.DB_FILE ?? 'database.sqlite';

// Make TypeScript happy for a singleton in dev/HMR:
type DB = InstanceType<typeof Database>;

// Reuse the same connection across reloads/process modules
declare global {
  // eslint-disable-next-line no-var
  var __rallyDb__: DB | undefined;
}

const db: DB = globalThis.__rallyDb__ ?? new Database(dbFile, { fileMustExist: true });

// Run one-time pragmas when we actually create it
if (!globalThis.__rallyDb__) {
  try {
    db.pragma('journal_mode = WAL');   // good defaults for better-sqlite3
    db.pragma('synchronous = NORMAL');
  } catch { }
  globalThis.__rallyDb__ = db;
}

export { db };
