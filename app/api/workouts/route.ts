import { env } from "cloudflare:workers";
import { ensureDatabase } from "@/db/ensure";
import { requireUser } from "@/lib/auth";
import { EXERCISES_BY_KEY, type Exercise } from "@/lib/workout-catalog";
import { json, readJson } from "@/lib/http";

type StartBody = { routineId?: string };
type WorkoutRow = {
  id: string;
  workoutType: string;
  status: string;
  startedAt: number;
  completedAt: number | null;
  durationSeconds: number | null;
  setCount: number;
  routineId: string | null;
  routineName: string | null;
  durationMinutes: number | null;
  difficulty: string | null;
  exercisesJson: string | null;
};

const legacyExercises = (workoutType: string) => {
  const keys = workoutType === "push"
    ? ["handstand-push-up", "dips", "planche"]
    : workoutType === "pull"
      ? ["muscle-up", "high-pull", "front-lever"]
      : [];
  return keys.map((key) => EXERCISES_BY_KEY[key]).filter((exercise): exercise is Exercise => Boolean(exercise));
};

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (!user) return json({ error: "Требуется вход" }, 401);
  await ensureDatabase();
  const rows = await env.DB.prepare(
    `SELECT ws.id, ws.workout_type AS workoutType, ws.status, ws.started_at AS startedAt,
            ws.completed_at AS completedAt, ws.duration_seconds AS durationSeconds,
            COUNT(s.id) AS setCount, snapshot.routine_id AS routineId,
            snapshot.routine_name AS routineName, snapshot.duration_minutes AS durationMinutes,
            snapshot.difficulty, snapshot.exercises_json AS exercisesJson
     FROM workout_sessions ws
     LEFT JOIN workout_sets s ON s.workout_session_id = ws.id
     LEFT JOIN workout_session_snapshots snapshot ON snapshot.workout_session_id = ws.id
     WHERE ws.user_id = ?1
     GROUP BY ws.id
     ORDER BY ws.started_at DESC
     LIMIT 30`,
  ).bind(user.id).all<WorkoutRow>();
  const mapWorkout = (item: WorkoutRow) => {
    let exercises: Exercise[] = [];
    if (item.exercisesJson) {
      try {
        exercises = JSON.parse(item.exercisesJson) as Exercise[];
      } catch {
        exercises = [];
      }
    }
    if (exercises.length === 0) exercises = legacyExercises(item.workoutType);
    return {
      ...item,
      routineName: item.routineName ?? item.workoutType.toUpperCase(),
      exercises,
      exercisesJson: undefined,
    };
  };
  const activeRow = rows.results.find((item) => item.status === "active");
  const active = activeRow ? mapWorkout(activeRow) : null;
  const history = rows.results.filter((item) => item.status === "completed").map(mapWorkout);
  return json({ active, history });
}

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user) return json({ error: "Требуется вход" }, 401);
  const body = await readJson<StartBody>(request);
  const routineId = body?.routineId?.trim() ?? "";
  if (!routineId) return json({ error: "Выберите набор тренировки" }, 400);
  await ensureDatabase();
  const active = await env.DB.prepare(
    `SELECT ws.id, ws.workout_type AS workoutType, ws.status, ws.started_at AS startedAt,
            snapshot.routine_id AS routineId, snapshot.routine_name AS routineName,
            snapshot.duration_minutes AS durationMinutes, snapshot.difficulty,
            snapshot.exercises_json AS exercisesJson
     FROM workout_sessions ws
     LEFT JOIN workout_session_snapshots snapshot ON snapshot.workout_session_id = ws.id
     WHERE ws.user_id = ?1 AND ws.status = 'active'
     ORDER BY ws.started_at DESC LIMIT 1`,
  ).bind(user.id).first();
  if (active) {
    let exercises: Exercise[] = [];
    if (typeof active.exercisesJson === "string") {
      try {
        exercises = JSON.parse(active.exercisesJson) as Exercise[];
      } catch {
        exercises = [];
      }
    }
    if (exercises.length === 0 && typeof active.workoutType === "string") {
      exercises = legacyExercises(active.workoutType);
    }
    return json({
      workout: {
        ...active,
        routineName: active.routineName ?? (
          typeof active.workoutType === "string" ? active.workoutType.toUpperCase() : "Тренировка"
        ),
        exercises,
        exercisesJson: undefined,
      },
    });
  }

  const routine = await env.DB.prepare(
    `SELECT id, name, duration_minutes AS durationMinutes, difficulty
     FROM workout_routines WHERE id = ?1 AND user_id = ?2`,
  ).bind(routineId, user.id).first<{
    id: string;
    name: string;
    durationMinutes: number;
    difficulty: string;
  }>();
  if (!routine) return json({ error: "Набор не найден" }, 404);
  const exerciseRows = await env.DB.prepare(
    `SELECT exercise_key AS exerciseKey
     FROM workout_routine_exercises
     WHERE routine_id = ?1
     ORDER BY position ASC`,
  ).bind(routineId).all<{ exerciseKey: string }>();
  const progressionRows = await env.DB.prepare(
    `SELECT exercise_key AS exerciseKey, progression
     FROM progression_selections
     WHERE user_id = ?1 AND workout_type = ?2`,
  ).bind(user.id, `routine:${routineId}`).all<{ exerciseKey: string; progression: string }>();
  const progressionMap = new Map(
    progressionRows.results.map((row) => [row.exerciseKey, row.progression]),
  );
  const exercises = exerciseRows.results
    .map((row) => EXERCISES_BY_KEY[row.exerciseKey])
    .filter((exercise): exercise is Exercise => Boolean(exercise));
  const snapshotExercises = exercises.map((exercise) => ({
    ...exercise,
    defaultProgression: progressionMap.get(exercise.key) ?? exercise.defaultProgression,
  }));
  if (exercises.length === 0) return json({ error: "В наборе нет упражнений" }, 400);

  const id = crypto.randomUUID();
  const startedAt = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO workout_sessions (id, user_id, workout_type, status, started_at) VALUES (?1, ?2, 'routine', 'active', ?3)",
    ).bind(id, user.id, startedAt),
    env.DB.prepare(
      `INSERT INTO workout_session_snapshots
         (workout_session_id, user_id, routine_id, routine_name, duration_minutes, difficulty, exercises_json)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    ).bind(
      id,
      user.id,
      routine.id,
      routine.name,
      routine.durationMinutes,
      routine.difficulty,
      JSON.stringify(snapshotExercises),
    ),
  ]);
  return json({
    workout: {
      id,
      workoutType: "routine",
      status: "active",
      startedAt,
      routineId: routine.id,
      routineName: routine.name,
      durationMinutes: routine.durationMinutes,
      difficulty: routine.difficulty,
      exercises: snapshotExercises,
    },
  }, 201);
}
