import { env } from "cloudflare:workers";
import { requireUser } from "@/lib/auth";
import { EXERCISES_BY_KEY, type Exercise } from "@/lib/workout-catalog";
import { json, readJson } from "@/lib/http";
import type { WorkoutAnalytics } from "@/lib/home-analytics";
import { loadRoutinePreview } from "@/lib/workout-preview";
import { findResumePosition, WORKOUT_ANALYTICS_SQL } from "@/lib/workouts";

type StartBody = { routineId?: string; routineRevision?: string };
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
type CompletedSetRow = {
  exerciseKey: string;
  setNumber: number;
};

const legacyExercises = (workoutType: string) => {
  const keys = workoutType === "push"
    ? ["handstand-push-up", "dips", "planche"]
    : workoutType === "pull"
      ? ["muscle-up", "high-pull", "front-lever"]
      : [];
  return keys.map((key) => EXERCISES_BY_KEY[key]).filter((exercise): exercise is Exercise => Boolean(exercise));
};

const parseExercises = (item: Pick<WorkoutRow, "exercisesJson" | "workoutType">) => {
  let exercises: Exercise[] = [];
  if (item.exercisesJson) {
    try {
      exercises = JSON.parse(item.exercisesJson) as Exercise[];
    } catch {
      exercises = [];
    }
  }
  return exercises.length > 0 ? exercises : legacyExercises(item.workoutType);
};

const mapWorkout = (item: WorkoutRow, completedSets?: CompletedSetRow[]) => {
  const exercises = parseExercises(item);
  return {
    ...item,
    routineName: item.routineName ?? item.workoutType.toUpperCase(),
    exercises,
    resume: completedSets ? findResumePosition(exercises, completedSets) : undefined,
    exercisesJson: undefined,
  };
};

async function readActiveWorkout(userId: string) {
  const active = await env.DB.prepare(
    `SELECT ws.id, ws.workout_type AS workoutType, ws.status, ws.started_at AS startedAt,
            ws.completed_at AS completedAt, ws.duration_seconds AS durationSeconds,
            (SELECT COUNT(*) FROM workout_sets s WHERE s.workout_session_id = ws.id) AS setCount,
            snapshot.routine_id AS routineId, snapshot.routine_name AS routineName,
            snapshot.duration_minutes AS durationMinutes, snapshot.difficulty,
            snapshot.exercises_json AS exercisesJson
     FROM workout_sessions ws
     LEFT JOIN workout_session_snapshots snapshot ON snapshot.workout_session_id = ws.id
     WHERE ws.user_id = ?1 AND ws.status = 'active'
     ORDER BY ws.started_at DESC
     LIMIT 1`,
  ).bind(userId).first<WorkoutRow>();
  if (!active) return null;

  const sets = await env.DB.prepare(
    `SELECT exercise_key AS exerciseKey, set_number AS setNumber
     FROM workout_sets
     WHERE workout_session_id = ?1`,
  ).bind(active.id).all<CompletedSetRow>();
  return mapWorkout(active, sets.results);
}

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (!user) return json({ error: "Требуется вход" }, 401);

  const [active, historyRows, analytics] = await Promise.all([
    readActiveWorkout(user.id),
    env.DB.prepare(
      `SELECT ws.id, ws.workout_type AS workoutType, ws.status, ws.started_at AS startedAt,
              ws.completed_at AS completedAt, ws.duration_seconds AS durationSeconds,
              COUNT(s.id) AS setCount, snapshot.routine_id AS routineId,
              snapshot.routine_name AS routineName, snapshot.duration_minutes AS durationMinutes,
              snapshot.difficulty, snapshot.exercises_json AS exercisesJson
       FROM workout_sessions ws
       LEFT JOIN workout_sets s ON s.workout_session_id = ws.id
       LEFT JOIN workout_session_snapshots snapshot ON snapshot.workout_session_id = ws.id
       WHERE ws.user_id = ?1 AND ws.status = 'completed'
       GROUP BY ws.id
       ORDER BY ws.completed_at DESC
       LIMIT 30`,
    ).bind(user.id).all<WorkoutRow>(),
    env.DB.prepare(WORKOUT_ANALYTICS_SQL).bind(user.id).first<WorkoutAnalytics>(),
  ]);
  return json({
    active,
    history: historyRows.results.map((item) => mapWorkout(item)),
    analytics: {
      totalCompleted: Number(analytics?.totalCompleted ?? 0),
      lastCompletedAt: analytics?.lastCompletedAt ?? null,
    },
  });
}

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user) return json({ error: "Требуется вход" }, 401);

  const existingActive = await readActiveWorkout(user.id);
  if (existingActive) return json({ workout: existingActive, existingActive: true });

  const body = await readJson<StartBody>(request);
  const routineId = body?.routineId?.trim() ?? "";
  const routineRevision = body?.routineRevision?.trim() ?? "";
  if (!routineId) return json({ error: "Выберите набор тренировки" }, 400);
  if (!routineRevision) return json({ error: "Сначала проверьте состав тренировки" }, 400);

  const routine = await loadRoutinePreview(env.DB, user.id, routineId);
  if (!routine) {
    return json({ error: "Набор не найден", code: "routine_not_found" }, 404);
  }
  if (routine.exercises.length === 0) {
    return json({
      error: "В этой тренировке пока нет упражнений",
      code: "routine_empty",
      routine,
    }, 400);
  }
  if (routine.revision !== routineRevision) {
    return json({
      error: "Тренировка изменилась. Проверьте обновлённый состав.",
      code: "routine_changed",
      routine,
    }, 409);
  }

  const id = crypto.randomUUID();
  const startedAt = Date.now();
  try {
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
        JSON.stringify(routine.exercises),
      ),
    ]);
  } catch (reason) {
    const concurrentActive = await readActiveWorkout(user.id);
    if (concurrentActive) {
      return json({ workout: concurrentActive, existingActive: true });
    }
    throw reason;
  }

  return json({
    workout: {
      id,
      workoutType: "routine",
      status: "active",
      startedAt,
      completedAt: null,
      durationSeconds: null,
      setCount: 0,
      routineId: routine.id,
      routineName: routine.name,
      durationMinutes: routine.durationMinutes,
      difficulty: routine.difficulty,
    exercises: routine.exercises,
    resume: { exerciseIndex: 0, setNumber: 1 },
    },
  }, 201);
}
