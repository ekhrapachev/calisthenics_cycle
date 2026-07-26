export type ResumePosition = {
  exerciseIndex: number;
  setNumber: number;
};

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
