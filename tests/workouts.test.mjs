import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { findResumePosition } from "../lib/workouts.ts";

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
