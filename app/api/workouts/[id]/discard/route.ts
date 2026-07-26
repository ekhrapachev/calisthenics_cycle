import { env } from "cloudflare:workers";
import { requireUser } from "@/lib/auth";
import { json } from "@/lib/http";
import { DISCARD_ACTIVE_WORKOUT_SQL } from "@/lib/workouts";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser(request);
  if (!user) return json({ error: "Требуется вход" }, 401);

  const { id } = await context.params;
  await env.DB.prepare(DISCARD_ACTIVE_WORKOUT_SQL).bind(id, user.id).run();

  return json({ ok: true, workoutId: id });
}
