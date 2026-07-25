import { env } from "cloudflare:workers";
import { ensureDatabase } from "@/db/ensure";

const SESSION_COOKIE = "forma_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
// Cloudflare Workers WebCrypto currently caps PBKDF2 at 100,000 iterations.
const HASH_ITERATIONS = 100_000;

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  gender: string;
  birthDate: string;
};

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toBase64Url(new Uint8Array(digest));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: HASH_ITERATIONS },
    key,
    256,
  );
  return `pbkdf2$${HASH_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, iterationsValue, saltValue, expectedValue] = stored.split("$");
  if (algorithm !== "pbkdf2" || !iterationsValue || !saltValue || !expectedValue) return false;
  const iterations = Number(iterationsValue);
  if (!Number.isSafeInteger(iterations) || iterations < 100_000) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromBase64Url(saltValue), iterations },
    key,
    256,
  );
  return constantTimeEqual(new Uint8Array(bits), fromBase64Url(expectedValue));
}

export function randomToken(size = 32) {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(size)));
}

function getCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  const prefix = `${name}=`;
  return cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix))?.slice(prefix.length) ?? null;
}

export async function createSession(userId: string, request: Request) {
  await ensureDatabase();
  const token = randomToken();
  const id = await sha256(token);
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)",
  ).bind(id, userId, now + SESSION_SECONDS * 1000, now).run();
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  const cookie = `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`;
  return { token, cookie };
}

export async function deleteSession(request: Request) {
  await ensureDatabase();
  const token = getCookie(request, SESSION_COOKIE);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE id = ?1").bind(await sha256(token)).run();
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export async function getUser(request: Request): Promise<AuthUser | null> {
  await ensureDatabase();
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const now = Date.now();
  const row = await env.DB.prepare(
    `SELECT users.id, users.email, users.name, users.gender, users.birth_date AS birthDate
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.id = ?1 AND sessions.expires_at > ?2`,
  ).bind(await sha256(token), now).first<AuthUser>();
  return row ?? null;
}

export async function requireUser(request: Request) {
  return getUser(request);
}
