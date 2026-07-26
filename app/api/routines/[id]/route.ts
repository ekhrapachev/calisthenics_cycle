import { env } from "cloudflare:workers";
import { requireUser } from "@/lib/auth";
import { parseRoutine, type RoutineInput } from "@/lib/routines";
import { json, readJson } from "@/lib/http";

const ownedRoutine = (id: string, userId: string) =>
  env.DB.prepare(
    "SELECT id FROM workout_routines WHERE id = ?1 AND user_id = ?2",
  ).bind(id, userId).first();

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser(request);
  if (!user) return json({ error: "Требуется вход" }, 401);
  const { id } = await context.params;
  if (!await ownedRoutine(id, user.id)) return json({ error: "Набор не найден" }, 404);

  const parsed = parseRoutine(await readJson<RoutineInput>(request));
  if ("error" in parsed) return json({ error: parsed.error }, 400);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE workout_routines
       SET name = ?1, duration_minutes = ?2, difficulty = ?3, updated_at = ?4
       WHERE id = ?5 AND user_id = ?6`,
    ).bind(parsed.name, parsed.durationMinutes, parsed.difficulty, now, id, user.id),
    env.DB.prepare("DELETE FROM workout_routine_exercises WHERE routine_id = ?1").bind(id),
    ...parsed.exerciseKeys.map((exerciseKey, position) =>
      env.DB.prepare(
        `INSERT INTO workout_routine_exercises (routine_id, exercise_key, position)
         VALUES (?1, ?2, ?3)`,
      ).bind(id, exerciseKey, position),
    ),
  ]);

  return json({
    routine: {
      id,
      name: parsed.name,
      durationMinutes: parsed.durationMinutes,
      difficulty: parsed.difficulty,
      exerciseKeys: parsed.exerciseKeys,
      updatedAt: now,
    },
  });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser(request);
  if (!user) return json({ error: "Требуется вход" }, 401);
  const { id } = await context.params;
  if (!await ownedRoutine(id, user.id)) return json({ error: "Набор не найден" }, 404);
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM progression_selections WHERE user_id = ?1 AND workout_type = ?2",
    ).bind(user.id, `routine:${id}`),
    env.DB.prepare(
      "DELETE FROM workout_routines WHERE id = ?1 AND user_id = ?2",
    ).bind(id, user.id),
  ]);
  return json({ ok: true });
}
