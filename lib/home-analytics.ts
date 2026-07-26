export type WorkoutAnalytics = {
  totalCompleted: number;
  lastCompletedAt: number | null;
};

export const EMPTY_WORKOUT_ANALYTICS: WorkoutAnalytics = {
  totalCompleted: 0,
  lastCompletedAt: null,
};

export function formatLastCompletedDate(
  value: number | null,
  now = new Date(),
  locale = "ru-RU",
) {
  if (value === null) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const includeYear = date.getFullYear() !== now.getFullYear();
  const parts = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    ...(includeYear ? { year: "numeric" as const } : {}),
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;

  return [part("day"), part("month"), includeYear ? part("year") : null]
    .filter(Boolean)
    .join(" ");
}
