import { env } from "cloudflare:workers";
import { requireUser } from "@/lib/auth";
import { json, readJson } from "@/lib/http";

type ProgressionBody = {
  routineId?: string;
  exerciseKey?: string;
  progression?: string;
};

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (!user) return json({ error: "Требуется вход" }, 401);
  const rows = await env.DB.prepare(
    `SELECT SUBSTR(workout_type, 9) AS routineId, exercise_key AS exerciseKey, progression
     FROM progression_selections
     WHERE user_id = ?1 AND workout_type LIKE 'routine:%'`,
  ).bind(user.id).all<{ routineId: string; exerciseKey: string; progression: string }>();
  return json({ progressions: rows.results });
}

export async function PUT(request: Request) {
  const user = await requireUser(request);
  if (!user) return json({ error: "Требуется вход" }, 401);
  const body = await readJson<ProgressionBody>(request);
  const routineId = body?.routineId?.trim() ?? "";
  const exerciseKey = body?.exerciseKey?.trim() ?? "";
  const progression = body?.progression?.trim() ?? "";
  if (!routineId || !exerciseKey || !progression) {
    return json({ error: "Некорректная прогрессия" }, 400);
  }
  const exercise = await env.DB.prepare(
    `SELECT re.exercise_key
     FROM workout_routine_exercises re
     INNER JOIN workout_routines r ON r.id = re.routine_id
     WHERE r.id = ?1 AND r.user_id = ?2 AND re.exercise_key = ?3`,
  ).bind(routineId, user.id, exerciseKey).first();
  if (!exercise) return json({ error: "Упражнение не найдено в наборе" }, 404);

  await env.DB.prepare(
    `INSERT INTO progression_selections (user_id, workout_type, exercise_key, progression, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(user_id, workout_type, exercise_key)
     DO UPDATE SET progression = excluded.progression, updated_at = excluded.updated_at`,
  ).bind(user.id, `routine:${routineId}`, exerciseKey, progression, Date.now()).run();
  return json({ ok: true, progression });
}
