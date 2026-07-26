import { env } from "cloudflare:workers";
import { createSession, isEmail, normalizeEmail, verifyPassword } from "@/lib/auth";
import { json, readJson } from "@/lib/http";

type LoginBody = { email?: string; password?: string };
type UserRow = { id: string; email: string; passwordHash: string; name: string; gender: string; birthDate: string };

export async function POST(request: Request) {
  const body = await readJson<LoginBody>(request);
  const email = normalizeEmail(body?.email ?? "");
  const password = body?.password ?? "";
  if (!isEmail(email) || !password) return json({ error: "Неверная почта или пароль" }, 401);

  const user = await env.DB.prepare(
    `SELECT id, email, password_hash AS passwordHash, name, gender, birth_date AS birthDate
     FROM users WHERE email = ?1`,
  ).bind(email).first<UserRow>();
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return json({ error: "Неверная почта или пароль" }, 401);
  }

  const session = await createSession(user.id, request);
  return json(
    { user: { id: user.id, email: user.email, name: user.name, gender: user.gender, birthDate: user.birthDate } },
    200,
    { "set-cookie": session.cookie },
  );
}
