import { EXERCISES_BY_KEY } from "@/lib/workout-catalog";

export type RoutineInput = {
  name?: string;
  durationMinutes?: number;
  difficulty?: string;
  exerciseKeys?: string[];
};

export function parseRoutine(body: RoutineInput | null) {
  const name = body?.name?.trim() ?? "";
  const durationMinutes = Number(body?.durationMinutes);
  const difficulty = body?.difficulty ?? "";
  const exerciseKeys = Array.isArray(body?.exerciseKeys)
    ? [...new Set(body.exerciseKeys.filter((key) => typeof key === "string"))]
    : [];

  if (!name) return { error: "Введите название набора" } as const;
  if (name.length > 80) return { error: "Название не должно быть длиннее 80 символов" } as const;
  if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 240) {
    return { error: "Укажите время от 5 до 240 минут" } as const;
  }
  if (!["easy", "medium", "hard"].includes(difficulty)) {
    return { error: "Выберите сложность" } as const;
  }
  if (exerciseKeys.length === 0 || exerciseKeys.some((key) => !EXERCISES_BY_KEY[key])) {
    return { error: "Добавьте хотя бы одно упражнение" } as const;
  }

  return { name, durationMinutes, difficulty, exerciseKeys } as const;
}
