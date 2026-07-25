import { env } from "cloudflare:workers";
import { ensureDatabase } from "@/db/ensure";
import { requireUser } from "@/lib/auth";
import { json, readJson } from "@/lib/http";

type StartBody = { workoutType?: string };
type WorkoutRow = {
  id: string;
  workoutType: string;
  status: string;
  startedAt: number;
  completedAt: number | null;
  durationSeconds: number | null;
  setCount: number;
};

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (!user) return json({ error: "Требуется вход" }, 401);
  await ensureDatabase();
  const rows = await env.DB.prepare(
    `SELECT ws.id, ws.workout_type AS workoutType, ws.status, ws.started_at AS startedAt,
            ws.completed_at AS completedAt, ws.duration_seconds AS durationSeconds,
            COUNT(s.id) AS setCount
     FROM workout_sessions ws
     LEFT JOIN workout_sets s ON s.workout_session_id = ws.id
     WHERE ws.user_id = ?1
     GROUP BY ws.id
     ORDER BY ws.started_at DESC
     LIMIT 30`,
  ).bind(user.id).all<WorkoutRow>();
  const active = rows.results.find((item) => item.status === "active") ?? null;
  const history = rows.results.filter((item) => item.status === "completed");
  return json({ active, history });
}

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user) return json({ error: "Требуется вход" }, 401);
  const body = await readJson<StartBody>(request);
  const workoutType = body?.workoutType ?? "";
  if (!["push", "pull"].includes(workoutType)) return json({ error: "Некорректный тип тренировки" }, 400);
  await ensureDatabase();
  const active = await env.DB.prepare(
    `SELECT id, workout_type AS workoutType, status, started_at AS startedAt
     FROM workout_sessions WHERE user_id = ?1 AND status = 'active' ORDER BY started_at DESC LIMIT 1`,
  ).bind(user.id).first();
  if (active) return json({ workout: active });

  const id = crypto.randomUUID();
  const startedAt = Date.now();
  await env.DB.prepare(
    "INSERT INTO workout_sessions (id, user_id, workout_type, status, started_at) VALUES (?1, ?2, ?3, 'active', ?4)",
  ).bind(id, user.id, workoutType, startedAt).run();
  return json({ workout: { id, workoutType, status: "active", startedAt } }, 201);
}
