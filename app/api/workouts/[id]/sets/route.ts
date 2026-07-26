import { env } from "cloudflare:workers";
import { requireUser } from "@/lib/auth";
import { json, readJson } from "@/lib/http";

type SetBody = {
  exerciseKey?: string;
  progression?: string;
  setNumber?: number;
  targetValue?: number;
  actualValue?: number;
  unit?: string;
  effort?: string | null;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser(request);
  if (!user) return json({ error: "Требуется вход" }, 401);
  const { id } = await context.params;
  const body = await readJson<SetBody>(request);
  const exerciseKey = body?.exerciseKey?.trim() ?? "";
  const progression = body?.progression?.trim() ?? "";
  const setNumber = Number(body?.setNumber);
  const targetValue = Number(body?.targetValue);
  const actualValue = Number(body?.actualValue);
  const unit = body?.unit?.trim() ?? "";
  const effort = body?.effort ?? null;
  if (
    !exerciseKey || !progression || !unit ||
    !Number.isInteger(setNumber) || setNumber < 1 ||
    !Number.isFinite(targetValue) || !Number.isFinite(actualValue) ||
    (effort !== null && !["easy", "reserve", "hard"].includes(effort))
  ) {
    return json({ error: "Некорректные данные подхода" }, 400);
  }

  const workout = await env.DB.prepare(
    "SELECT id FROM workout_sessions WHERE id = ?1 AND user_id = ?2 AND status = 'active'",
  ).bind(id, user.id).first();
  if (!workout) return json({ error: "Активная тренировка не найдена" }, 404);

  const setId = `${id}:${exerciseKey}:${setNumber}`;
  await env.DB.prepare(
    `INSERT INTO workout_sets
       (id, user_id, workout_session_id, exercise_key, progression, set_number, target_value, actual_value, unit, effort, completed_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
     ON CONFLICT(workout_session_id, exercise_key, set_number)
     DO UPDATE SET progression = excluded.progression, actual_value = excluded.actual_value,
                   effort = COALESCE(excluded.effort, workout_sets.effort), completed_at = excluded.completed_at`,
  ).bind(
    setId, user.id, id, exerciseKey, progression, setNumber,
    Math.round(targetValue), Math.round(actualValue), unit, effort, Date.now(),
  ).run();
  return json({ ok: true });
}
