import { env } from "cloudflare:workers";
import { createSession, hashPassword, isEmail, normalizeEmail } from "@/lib/auth";
import { ensureDatabase } from "@/db/ensure";
import { json, readJson } from "@/lib/http";

type RegisterBody = {
  email?: string;
  password?: string;
  name?: string;
  gender?: string;
  birthDate?: string;
};

export async function POST(request: Request) {
  const body = await readJson<RegisterBody>(request);
  const email = normalizeEmail(body?.email ?? "");
  const password = body?.password ?? "";
  const name = body?.name?.trim() ?? "";
  const gender = body?.gender ?? "";
  const birthDate = body?.birthDate ?? "";

  if (!isEmail(email)) return json({ error: "Введите корректную почту" }, 400);
  if (password.length < 8) return json({ error: "Пароль должен содержать минимум 8 символов" }, 400);
  if (!name) return json({ error: "Введите имя" }, 400);
  if (!["male", "female", "unspecified"].includes(gender)) return json({ error: "Выберите пол" }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return json({ error: "Укажите дату рождения" }, 400);

  await ensureDatabase();
  const exists = await env.DB.prepare("SELECT id FROM users WHERE email = ?1").bind(email).first();
  if (exists) return json({ error: "Аккаунт с такой почтой уже существует" }, 409);

  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, name, gender, birth_date, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`,
  ).bind(id, email, await hashPassword(password), name, gender, birthDate, now).run();

  const session = await createSession(id, request);
  return json(
    { user: { id, email, name, gender, birthDate } },
    201,
    { "set-cookie": session.cookie },
  );
}
