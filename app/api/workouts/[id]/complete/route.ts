import { env } from "cloudflare:workers";
import { requireUser } from "@/lib/auth";
import { json } from "@/lib/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser(request);
  if (!user) return json({ error: "Требуется вход" }, 401);
  const { id } = await context.params;
  const workout = await env.DB.prepare(
    "SELECT started_at AS startedAt FROM workout_sessions WHERE id = ?1 AND user_id = ?2 AND status = 'active'",
  ).bind(id, user.id).first<{ startedAt: number }>();
  if (!workout) return json({ error: "Активная тренировка не найдена" }, 404);
  const completedAt = Date.now();
  const duration = Math.max(1, Math.round((completedAt - workout.startedAt) / 1000));
  await env.DB.prepare(
    `UPDATE workout_sessions SET status = 'completed', completed_at = ?1, duration_seconds = ?2
     WHERE id = ?3 AND user_id = ?4`,
  ).bind(completedAt, duration, id, user.id).run();
  const setCount = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM workout_sets WHERE workout_session_id = ?1",
  ).bind(id).first<{ count: number }>();
  return json({ workout: { id, status: "completed", completedAt, durationSeconds: duration, setCount: setCount?.count ?? 0 } });
}
