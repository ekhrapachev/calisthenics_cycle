import { env } from "cloudflare:workers";
import { requireUser } from "@/lib/auth";
import { json } from "@/lib/http";
import { loadRoutinePreview } from "@/lib/workout-preview";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser(request);
  if (!user) return json({ error: "Требуется вход" }, 401);
  const { id } = await context.params;
  const routine = await loadRoutinePreview(env.DB, user.id, id);
  if (!routine) return json({ error: "Набор не найден", code: "routine_not_found" }, 404);
  return json({ routine });
}
