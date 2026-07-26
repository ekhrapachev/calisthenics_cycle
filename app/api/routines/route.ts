import { env } from "cloudflare:workers";
import { requireUser } from "@/lib/auth";
import { parseRoutine, type RoutineInput } from "@/lib/routines";
import { DEFAULT_ROUTINES } from "@/lib/workout-catalog";
import { json, readJson } from "@/lib/http";

type RoutineRow = {
  id: string;
  name: string;
  durationMinutes: number;
  difficulty: string;
  createdAt: number;
  updatedAt: number;
};

type ExerciseRow = {
  routineId: string;
  exerciseKey: string;
};

async function seedRoutines(userId: string) {
  const profile = await env.DB.prepare(
    "SELECT user_id FROM workout_routine_profiles WHERE user_id = ?1",
  ).bind(userId).first();
  if (profile) return;

  const now = Date.now();
  const statements = [
    env.DB.prepare(
      "INSERT INTO workout_routine_profiles (user_id, initialized_at) VALUES (?1, ?2)",
    ).bind(userId, now),
  ];

  DEFAULT_ROUTINES.forEach((routine, routineIndex) => {
    const id = crypto.randomUUID();
    statements.push(
      env.DB.prepare(
        `INSERT INTO workout_routines
           (id, user_id, name, duration_minutes, difficulty, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)`,
      ).bind(id, userId, routine.name, routine.durationMinutes, routine.difficulty, now + routineIndex),
    );
    routine.exerciseKeys.forEach((exerciseKey, position) => {
      statements.push(
        env.DB.prepare(
          `INSERT INTO workout_routine_exercises (routine_id, exercise_key, position)
           VALUES (?1, ?2, ?3)`,
        ).bind(id, exerciseKey, position),
      );
    });
  });

  await env.DB.batch(statements);
}

async function listRoutines(userId: string) {
  const [routineRows, exerciseRows] = await Promise.all([
    env.DB.prepare(
      `SELECT id, name, duration_minutes AS durationMinutes, difficulty,
              created_at AS createdAt, updated_at AS updatedAt
       FROM workout_routines
       WHERE user_id = ?1
       ORDER BY created_at ASC`,
    ).bind(userId).all<RoutineRow>(),
    env.DB.prepare(
      `SELECT re.routine_id AS routineId, re.exercise_key AS exerciseKey
       FROM workout_routine_exercises re
       INNER JOIN workout_routines r ON r.id = re.routine_id
       WHERE r.user_id = ?1
       ORDER BY r.created_at ASC, re.position ASC`,
    ).bind(userId).all<ExerciseRow>(),
  ]);

  const exercises = new Map<string, string[]>();
  exerciseRows.results.forEach((row) => {
    const items = exercises.get(row.routineId) ?? [];
    items.push(row.exerciseKey);
    exercises.set(row.routineId, items);
  });
  return routineRows.results.map((routine) => ({
    ...routine,
    exerciseKeys: exercises.get(routine.id) ?? [],
  }));
}

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (!user) return json({ error: "Требуется вход" }, 401);
  await seedRoutines(user.id);
  return json({ routines: await listRoutines(user.id) });
}

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user) return json({ error: "Требуется вход" }, 401);
  await seedRoutines(user.id);
  const parsed = parseRoutine(await readJson<RoutineInput>(request));
  if ("error" in parsed) return json({ error: parsed.error }, 400);

  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO workout_routines
         (id, user_id, name, duration_minutes, difficulty, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)`,
    ).bind(id, user.id, parsed.name, parsed.durationMinutes, parsed.difficulty, now),
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
      createdAt: now,
      updatedAt: now,
    },
  }, 201);
}
