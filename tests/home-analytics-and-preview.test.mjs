import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { formatLastCompletedDate } from "../lib/home-analytics.ts";
import { WORKOUT_ANALYTICS_SQL } from "../lib/workouts.ts";

const appSource = readFileSync(
  new URL("../app/FormaApp.tsx", import.meta.url),
  "utf8",
);
const workoutRoute = readFileSync(
  new URL("../app/api/workouts/route.ts", import.meta.url),
  "utf8",
);
const previewRoute = readFileSync(
  new URL("../app/api/routines/[id]/preview/route.ts", import.meta.url),
  "utf8",
);
const previewDomain = readFileSync(
  new URL("../lib/workout-preview.ts", import.meta.url),
  "utf8",
);
const styles = readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);

test("server analytics counts every saved completion and uses maximum completedAt", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE workout_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      completed_at INTEGER
    );
    INSERT INTO workout_sessions VALUES
      ('completed-old', 'owner', 'completed', 100),
      ('active', 'owner', 'active', NULL),
      ('discarded', 'owner', 'superseded', 300),
      ('completed-new', 'owner', 'completed', 500),
      ('incomplete-completed', 'owner', 'completed', NULL),
      ('other', 'other', 'completed', 900);
  `);
  const analytics = database.prepare(WORKOUT_ANALYTICS_SQL.replace("?1", "?")).get("owner");
  assert.equal(analytics.totalCompleted, 2);
  assert.equal(analytics.lastCompletedAt, 500);
  assert.match(workoutRoute, /analytics:[\s\S]*totalCompleted[\s\S]*lastCompletedAt/);
  assert.doesNotMatch(appSource, /const total = history\.length/);
});

test("last workout date is localized, omits only the current year, and has an empty value", () => {
  const now = new Date(2026, 6, 27, 12);
  assert.equal(formatLastCompletedDate(new Date(2026, 6, 24, 8).getTime(), now), "24 июля");
  assert.equal(formatLastCompletedDate(new Date(2025, 6, 24, 8).getTime(), now), "24 июля 2025");
  assert.equal(formatLastCompletedDate(null, now), "—");
  assert.match(appSource, /Ещё не было/);
  assert.doesNotMatch(appSource, /Тренировок<br \/>подряд|Личный рекорд|♨/);
});

test("analytics cards share typography and history is the only interactive stat", () => {
  assert.match(styles, /\.home-stat-card > strong\s*\{[\s\S]*font-size:\s*36px;[\s\S]*font-weight:\s*850;[\s\S]*line-height:\s*1;/);
  assert.match(appSource, /className="home-stat-card history-stat-card"[\s\S]*setScreen\("history"\)/);
  assert.match(appSource, /className="home-stat-card last-workout-card"/);
  assert.match(appSource, /homeStatus === "loading"[\s\S]*stat-card-skeleton/);
  assert.match(appSource, /homeStatus === "error"[\s\S]*Не удалось загрузить статистику/);
});

test("picker opens preview without issuing the start request", () => {
  assert.match(appSource, /onClick=\{\(\) => openRoutinePreview\(routine, "home"\)\}/);
  assert.match(appSource, /Выбери набор, чтобы проверить состав\./);
  assert.match(appSource, /aria-label=\{`Проверить состав тренировки \$\{routine\.name\}`\}/);
  assert.doesNotMatch(appSource, /onClick=\{\(\) => void startWorkout\(routine\.id/);
  assert.match(previewRoute, /loadRoutinePreview\(env\.DB, user\.id, id\)/);
});

test("preview and snapshot use one builder and revision protects content", () => {
  assert.match(previewDomain, /export function buildRoutinePreview/);
  assert.match(previewDomain, /source\.exerciseKeys[\s\S]*source\.progressions/);
  assert.match(previewDomain, /revision = hashString\(JSON\.stringify/);
  assert.match(workoutRoute, /loadRoutinePreview\(env\.DB, user\.id, routineId\)/);
  assert.match(workoutRoute, /routine\.revision !== routineRevision/);
  assert.match(workoutRoute, /code: "routine_changed"/);
  assert.match(workoutRoute, /JSON\.stringify\(routine\.exercises\)/);
});

test("preview start is CTA-only, double-tap guarded, retryable, and opens the first set", () => {
  assert.match(appSource, /startRequestRef\.current[\s\S]*return;/);
  assert.match(appSource, /body: JSON\.stringify\(\{[\s\S]*routineRevision: previewRoutine\.revision/);
  assert.match(appSource, /onClick=\{\(\) => void startWorkout\(\)\}/);
  assert.match(appSource, /startingRoutineId \? "Начинаем…" : "Начать тренировку"/);
  assert.match(appSource, /setPreviewStartError\(message\)/);
  assert.match(appSource, /setExerciseIndex\(workout\.resume\.exerciseIndex\)[\s\S]*setSetNumber\(workout\.resume\.setNumber\)/);
});

test("safe return restores picker scroll and focus without creating a workout", () => {
  assert.match(appSource, /workoutPickerScrollRef\.current = workoutPickerListRef\.current\?\.scrollTop/);
  assert.match(appSource, /workoutPickerListRef\.current\.scrollTop = workoutPickerScrollRef\.current/);
  assert.match(appSource, /workoutPickerCardsRef\.current\.get\(routineId\)\?\.focus\(\)/);
  assert.match(appSource, /window\.addEventListener\("popstate", handlePopState\)/);
  const returnFunction = appSource.match(/const restorePickerContext[\s\S]*?\n  };/)?.[0] ?? "";
  assert.doesNotMatch(returnFunction, /\/api\/workouts|startWorkout/);
});

test("stale, deleted, empty, failed, and existing-active states are handled", () => {
  assert.match(appSource, /reason\.payload\.code === "routine_changed"/);
  assert.match(appSource, /Набор больше недоступен\. Вернитесь к выбору\./);
  assert.match(appSource, /В этой тренировке пока нет упражнений/);
  assert.match(appSource, /У вас уже есть активная тренировка/);
  assert.match(workoutRoute, /code: "routine_not_found"/);
  assert.match(workoutRoute, /code: "routine_empty"/);
  assert.match(workoutRoute, /existingActive: true/);
});
