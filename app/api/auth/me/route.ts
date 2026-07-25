import { getUser } from "@/lib/auth";
import { json } from "@/lib/http";

export async function GET(request: Request) {
  const user = await getUser(request);
  return user ? json({ user }) : json({ user: null }, 401);
}
