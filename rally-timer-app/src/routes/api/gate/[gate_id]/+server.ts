import { json, type RequestEvent } from "@sveltejs/kit";
import * as z from 'zod';
import Database from "better-sqlite3";

const Passing = z.object({
  timestamp: z.number(),
});

export async function POST(event: RequestEvent): Promise<Response> {
  console.log("New POST");
  const passing = Passing.parse(await event.request.json());
  console.log(passing);
  console.log(process.cwd());

  const db = new Database('database.sqlite', { fileMustExist: true });
  db.pragma('journal_mode = WAL');

  let result = db.prepare("INSERT INTO passings(gate_id, timestamp) VALUES(?,?);").run(event.params.gate_id, passing.timestamp);

  return json(result);
}
