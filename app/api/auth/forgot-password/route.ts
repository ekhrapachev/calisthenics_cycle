import { env } from "cloudflare:workers";
import { ensureDatabase } from "@/db/ensure";
import { isEmail, normalizeEmail, randomToken } from "@/lib/auth";
import { json, readJson } from "@/lib/http";

type ForgotBody = { email?: string };

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  const body = await readJson<ForgotBody>(request);
  const email = normalizeEmail(body?.email ?? "");
  if (!isEmail(email)) return json({ error: "Введите корректную почту" }, 400);

  await ensureDatabase();
  const user = await env.DB.prepare("SELECT id FROM users WHERE email = ?1").bind(email).first<{ id: string }>();
  if (user) {
    const token = randomToken();
    await env.DB.prepare(
      "INSERT INTO password_reset_tokens (id, user_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)",
    ).bind(await digest(token), user.id, Date.now() + 60 * 60 * 1000, Date.now()).run();
    // Email delivery is wired after a provider key is configured. Never reveal whether the account exists.
  }
  return json({ ok: true });
}
