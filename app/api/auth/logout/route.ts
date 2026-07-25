import { deleteSession } from "@/lib/auth";
import { json } from "@/lib/http";

export async function POST(request: Request) {
  const cookie = await deleteSession(request);
  return json({ ok: true }, 200, { "set-cookie": cookie });
}
