export type ResumePosition = {
  exerciseIndex: number;
  setNumber: number;
};

export type WorkoutExerciseState = "completed" | "current" | "upcoming";

type SnapshotExercise = {
  key: string;
  sets: number;
};

type CompletedSet = {
  exerciseKey: string;
  setNumber: number;
};

export function findResumePosition(
  exercises: SnapshotExercise[],
  completedSets: CompletedSet[],
): ResumePosition | null {
  const completed = new Set(
    completedSets.map((set) => `${set.exerciseKey}:${set.setNumber}`),
  );

  for (const [exerciseIndex, exercise] of exercises.entries()) {
    for (let setNumber = 1; setNumber <= exercise.sets; setNumber += 1) {
      if (!completed.has(`${exercise.key}:${setNumber}`)) {
        return { exerciseIndex, setNumber };
      }
    }
  }

  return null;
}

export function getWorkoutExerciseStates(
  exerciseCount: number,
  resume: ResumePosition | null,
): WorkoutExerciseState[] {
  return Array.from({ length: exerciseCount }, (_, exerciseIndex) => {
    if (!resume || exerciseIndex < resume.exerciseIndex) return "completed";
    if (exerciseIndex === resume.exerciseIndex) return "current";
    return "upcoming";
  });
}

export const DISCARD_ACTIVE_WORKOUT_SQL =
  "DELETE FROM workout_sessions WHERE id = ?1 AND user_id = ?2 AND status = 'active'";

export const WORKOUT_ANALYTICS_SQL = `
  SELECT COUNT(*) AS totalCompleted, MAX(completed_at) AS lastCompletedAt
  FROM workout_sessions
  WHERE user_id = ?1 AND status = 'completed' AND completed_at IS NOT NULL
`;
