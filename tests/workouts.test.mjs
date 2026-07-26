import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  DISCARD_ACTIVE_WORKOUT_SQL,
  findResumePosition,
  getWorkoutExerciseStates,
} from "../lib/workouts.ts";

const exercises = [
  { key: "push-up", sets: 2 },
  { key: "pull-up", sets: 3 },
];

test("resume starts at the first set when nothing is completed", () => {
  assert.deepEqual(findResumePosition(exercises, []), {
    exerciseIndex: 0,
    setNumber: 1,
  });
});

test("resume finds the first unfinished set across exercises", () => {
  assert.deepEqual(findResumePosition(exercises, [
    { exerciseKey: "push-up", setNumber: 1 },
    { exerciseKey: "push-up", setNumber: 2 },
    { exerciseKey: "pull-up", setNumber: 1 },
  ]), {
    exerciseIndex: 1,
    setNumber: 2,
  });
});

test("resume is independent from routine existence and ignores unrelated results", () => {
  assert.deepEqual(findResumePosition(exercises, [
    { exerciseKey: "deleted-routine-exercise", setNumber: 1 },
    { exerciseKey: "push-up", setNumber: 1 },
  ]), {
    exerciseIndex: 0,
    setNumber: 2,
  });
});

test("resume is null when every snapshot set is completed", () => {
  assert.equal(findResumePosition(exercises, [
    { exerciseKey: "push-up", setNumber: 1 },
    { exerciseKey: "push-up", setNumber: 2 },
    { exerciseKey: "pull-up", setNumber: 1 },
    { exerciseKey: "pull-up", setNumber: 2 },
    { exerciseKey: "pull-up", setNumber: 3 },
  ]), null);
});

test("active workout exercise states follow the single server resume position", () => {
  assert.deepEqual(getWorkoutExerciseStates(5, { exerciseIndex: 2, setNumber: 3 }), [
    "completed",
    "completed",
    "current",
    "upcoming",
    "upcoming",
  ]);
  assert.deepEqual(getWorkoutExerciseStates(2, { exerciseIndex: 0, setNumber: 1 }), [
    "current",
    "upcoming",
  ]);
  assert.deepEqual(getWorkoutExerciseStates(3, null), [
    "completed",
    "completed",
    "completed",
  ]);
});

const createWorkoutDatabase = () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (
      id TEXT PRIMARY KEY NOT NULL
    );
    CREATE TABLE workout_routines (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL
    );
    CREATE TABLE workout_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      workout_type TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      duration_seconds INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX workout_sessions_one_active_user_idx
      ON workout_sessions(user_id) WHERE status = 'active';
    CREATE TABLE workout_session_snapshots (
      workout_session_id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      routine_id TEXT,
      routine_name TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      difficulty TEXT NOT NULL,
      exercises_json TEXT NOT NULL,
      FOREIGN KEY (workout_session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE workout_sets (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      workout_session_id TEXT NOT NULL,
      exercise_key TEXT NOT NULL,
      set_number INTEGER NOT NULL,
      actual_value INTEGER NOT NULL,
      FOREIGN KEY (workout_session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    INSERT INTO users VALUES ('owner'), ('other');
    INSERT INTO workout_routines VALUES ('routine', 'owner', 'Edited name');
    INSERT INTO workout_sessions VALUES
      ('active-owned', 'owner', 'routine', 'active', 10, NULL, NULL),
      ('completed-owned', 'owner', 'routine', 'completed', 1, 5, 4),
      ('active-other', 'other', 'routine', 'active', 11, NULL, NULL);
    INSERT INTO workout_session_snapshots VALUES
      ('active-owned', 'owner', 'routine', 'Snapshot name', 35, 'medium',
       '[{"key":"snapshot-only","name":"Snapshot exercise","sets":2}]'),
      ('completed-owned', 'owner', 'routine', 'History item', 30, 'easy', '[]'),
      ('active-other', 'other', NULL, 'Other workout', 20, 'hard', '[]');
    INSERT INTO workout_sets VALUES
      ('active-set-1', 'owner', 'active-owned', 'snapshot-only', 1, 8),
      ('active-set-2', 'owner', 'active-owned', 'snapshot-only', 2, 7),
      ('history-set', 'owner', 'completed-owned', 'snapshot-only', 1, 9),
      ('other-set', 'other', 'active-other', 'private', 1, 5);
  `);
  return database;
};

const aggregateFor = (database, userId) => database.prepare(`
  SELECT
    COUNT(DISTINCT ws.id) AS workouts,
    COALESCE(SUM(s.actual_value), 0) AS volume,
    COALESCE(SUM(ws.duration_seconds), 0) AS duration
  FROM workout_sessions ws
  LEFT JOIN workout_sets s ON s.workout_session_id = ws.id
  WHERE ws.user_id = ? AND ws.status = 'completed'
`).get(userId);

test("discard deletes only the owner's active workout and cascades snapshot and sets", () => {
  const database = createWorkoutDatabase();
  const before = aggregateFor(database, "owner");

  const result = database.prepare(DISCARD_ACTIVE_WORKOUT_SQL).run("active-owned", "owner");
  assert.equal(result.changes, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM workout_sessions WHERE id = ?").get("active-owned").count, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM workout_session_snapshots WHERE workout_session_id = ?").get("active-owned").count, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM workout_sets WHERE workout_session_id = ?").get("active-owned").count, 0);
  assert.deepEqual(aggregateFor(database, "owner"), before);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM workout_sessions WHERE id = 'completed-owned'").get().count, 1);
});

test("discard is idempotent and permits starting a new active workout", () => {
  const database = createWorkoutDatabase();
  const discard = database.prepare(DISCARD_ACTIVE_WORKOUT_SQL);
  assert.equal(discard.run("active-owned", "owner").changes, 1);
  assert.equal(discard.run("active-owned", "owner").changes, 0);
  assert.doesNotThrow(() => database.prepare(`
    INSERT INTO workout_sessions
      (id, user_id, workout_type, status, started_at)
    VALUES (?, ?, 'routine', 'active', ?)
  `).run("next-active", "owner", 12));
});

test("discard does not delete completed or another user's workout", () => {
  const database = createWorkoutDatabase();
  const discard = database.prepare(DISCARD_ACTIVE_WORKOUT_SQL);
  assert.equal(discard.run("completed-owned", "owner").changes, 0);
  assert.equal(discard.run("active-other", "owner").changes, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM workout_sessions WHERE id = 'completed-owned'").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM workout_sessions WHERE id = 'active-other'").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM workout_sets WHERE workout_session_id = 'active-other'").get().count, 1);
});

test("active workout presentation remains snapshot-based after routine edit and deletion", () => {
  const database = createWorkoutDatabase();
  database.prepare("UPDATE workout_routines SET name = 'New live name' WHERE id = 'routine'").run();
  const snapshotAfterEdit = database.prepare(`
    SELECT routine_name AS routineName, exercises_json AS exercisesJson
    FROM workout_session_snapshots WHERE workout_session_id = 'active-owned'
  `).get();
  assert.equal(snapshotAfterEdit.routineName, "Snapshot name");
  assert.equal(JSON.parse(snapshotAfterEdit.exercisesJson)[0].name, "Snapshot exercise");

  database.prepare("DELETE FROM workout_routines WHERE id = 'routine'").run();
  const snapshotAfterDelete = database.prepare(`
    SELECT routine_name AS routineName, exercises_json AS exercisesJson
    FROM workout_session_snapshots WHERE workout_session_id = 'active-owned'
  `).get();
  assert.deepEqual(snapshotAfterDelete, snapshotAfterEdit);
});

test("discard route is authenticated, ownership-scoped, active-only, and always returns success", () => {
  const route = readFileSync(
    new URL("../app/api/workouts/[id]/discard/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /requireUser\(request\)/);
  assert.match(route, /DISCARD_ACTIVE_WORKOUT_SQL/);
  assert.match(route, /return json\(\{ ok: true, workoutId: id \}\)/);
  assert.equal(DISCARD_ACTIVE_WORKOUT_SQL, "DELETE FROM workout_sessions WHERE id = ?1 AND user_id = ?2 AND status = 'active'");
});

test("active workout details reuse loaded snapshot data and the same resumeWorkout path", () => {
  const source = readFileSync(
    new URL("../app/FormaApp.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /activeExercises\.map/);
  assert.doesNotMatch(source, /api\/workouts\/[^`]*details/);
  assert.match(source, /className={`active-workout-exercise \$\{state\}`}/);
  assert.match(source, /void resumeWorkout\(\)/);
  assert.match(source, /role="dialog"[\s\S]*aria-modal="true"[\s\S]*active-workout-details-title/);
  assert.match(source, /role="alertdialog"[\s\S]*aria-modal="true"[\s\S]*discard-workout-title/);
});

test("migration keeps one active session and rejects a parallel duplicate", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE workout_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      workout_type TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      duration_seconds INTEGER
    );
    INSERT INTO workout_sessions VALUES
      ('older', 'user-1', 'routine', 'active', 1, NULL, NULL),
      ('newer', 'user-1', 'routine', 'active', 2, NULL, NULL);
  `);
  const migration = readFileSync(
    new URL("../drizzle/0002_gigantic_mandarin.sql", import.meta.url),
    "utf8",
  );
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }

  const active = database.prepare(
    "SELECT id FROM workout_sessions WHERE user_id = ? AND status = 'active'",
  ).all("user-1");
  assert.equal(active.length, 1);
  assert.equal(active[0].id, "newer");
  assert.throws(() => database.prepare(
    "INSERT INTO workout_sessions (id, user_id, workout_type, status, started_at) VALUES (?, ?, 'routine', 'active', ?)",
  ).run("parallel", "user-1", 3), /UNIQUE constraint failed/);

  database.prepare(
    "UPDATE workout_sessions SET status = 'completed' WHERE id = ?",
  ).run("newer");
  assert.doesNotThrow(() => database.prepare(
    "INSERT INTO workout_sessions (id, user_id, workout_type, status, started_at) VALUES (?, ?, 'routine', 'active', ?)",
  ).run("next", "user-1", 4));
});
