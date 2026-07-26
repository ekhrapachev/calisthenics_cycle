import { EXERCISES_BY_KEY, type Exercise } from "@/lib/workout-catalog";

export type RoutineDifficulty = "easy" | "medium" | "hard";

export type RoutinePreview = {
  id: string;
  revision: string;
  name: string;
  durationMinutes: number;
  difficulty: RoutineDifficulty;
  exercises: Exercise[];
};

type RoutinePreviewSource = {
  id: string;
  name: string;
  durationMinutes: number;
  difficulty: string;
  exerciseKeys: string[];
  progressions: Record<string, string>;
};

const hashString = (value: string) => {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
};

export function buildRoutinePreview(source: RoutinePreviewSource): RoutinePreview {
  const exercises = source.exerciseKeys
    .map((key) => EXERCISES_BY_KEY[key])
    .filter((exercise): exercise is Exercise => Boolean(exercise))
    .map((exercise) => {
      const selected = source.progressions[exercise.key];
      return {
        ...exercise,
        defaultProgression:
          selected && exercise.progressions.includes(selected)
            ? selected
            : exercise.defaultProgression,
      };
    });
  const difficulty = (
    ["easy", "medium", "hard"].includes(source.difficulty)
      ? source.difficulty
      : "medium"
  ) as RoutineDifficulty;
  const revision = hashString(JSON.stringify({
    id: source.id,
    name: source.name,
    durationMinutes: source.durationMinutes,
    difficulty,
    exercises,
  }));

  return {
    id: source.id,
    revision,
    name: source.name,
    durationMinutes: source.durationMinutes,
    difficulty,
    exercises,
  };
}

type RoutineRow = {
  id: string;
  name: string;
  durationMinutes: number;
  difficulty: string;
};

export async function loadRoutinePreview(
  database: D1Database,
  userId: string,
  routineId: string,
) {
  const routine = await database.prepare(
    `SELECT id, name, duration_minutes AS durationMinutes, difficulty
     FROM workout_routines WHERE id = ?1 AND user_id = ?2`,
  ).bind(routineId, userId).first<RoutineRow>();
  if (!routine) return null;

  const [exerciseRows, progressionRows] = await Promise.all([
    database.prepare(
      `SELECT exercise_key AS exerciseKey
       FROM workout_routine_exercises
       WHERE routine_id = ?1
       ORDER BY position ASC`,
    ).bind(routineId).all<{ exerciseKey: string }>(),
    database.prepare(
      `SELECT exercise_key AS exerciseKey, progression
       FROM progression_selections
       WHERE user_id = ?1 AND workout_type = ?2`,
    ).bind(userId, `routine:${routineId}`).all<{
      exerciseKey: string;
      progression: string;
    }>(),
  ]);

  return buildRoutinePreview({
    ...routine,
    exerciseKeys: exerciseRows.results.map((row) => row.exerciseKey),
    progressions: Object.fromEntries(
      progressionRows.results.map((row) => [row.exerciseKey, row.progression]),
    ),
  });
}
