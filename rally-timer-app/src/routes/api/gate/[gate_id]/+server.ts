import { json, type RequestEvent } from "@sveltejs/kit";

export async function POST(event: RequestEvent): Promise<Response> {
  console.log("test");
  console.log(await event.request.json());
  return json({ "debug": "hej" });
}
