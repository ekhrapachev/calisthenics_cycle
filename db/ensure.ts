import { env } from "cloudflare:workers";

let initialized = false;
let initializing: Promise<void> | null = null;

const statements = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    gender TEXT NOT NULL,
    birth_date TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)`,
  `CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at)`,
  `CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS password_reset_user_idx ON password_reset_tokens(user_id)`,
  `CREATE TABLE IF NOT EXISTS progression_selections (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workout_type TEXT NOT NULL,
    exercise_key TEXT NOT NULL,
    progression TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(user_id, workout_type, exercise_key)
  )`,
  `CREATE TABLE IF NOT EXISTS workout_routine_profiles (
    user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    initialized_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS workout_routines (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    difficulty TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS workout_routines_user_idx ON workout_routines(user_id, created_at ASC)`,
  `CREATE TABLE IF NOT EXISTS workout_routine_exercises (
    routine_id TEXT NOT NULL REFERENCES workout_routines(id) ON DELETE CASCADE,
    exercise_key TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY(routine_id, exercise_key)
  )`,
  `CREATE INDEX IF NOT EXISTS workout_routine_exercises_order_idx ON workout_routine_exercises(routine_id, position ASC)`,
  `CREATE TABLE IF NOT EXISTS workout_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workout_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    duration_seconds INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS workout_sessions_user_idx ON workout_sessions(user_id, started_at DESC)`,
  `CREATE TABLE IF NOT EXISTS workout_session_snapshots (
    workout_session_id TEXT PRIMARY KEY NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    routine_id TEXT,
    routine_name TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    difficulty TEXT NOT NULL,
    exercises_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS workout_sets (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workout_session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
    exercise_key TEXT NOT NULL,
    progression TEXT NOT NULL,
    set_number INTEGER NOT NULL,
    target_value INTEGER NOT NULL,
    actual_value INTEGER NOT NULL,
    unit TEXT NOT NULL,
    effort TEXT,
    completed_at INTEGER NOT NULL,
    UNIQUE(workout_session_id, exercise_key, set_number)
  )`,
  `CREATE INDEX IF NOT EXISTS workout_sets_user_idx ON workout_sets(user_id, completed_at DESC)`,
];

export async function ensureDatabase() {
  if (initialized) return;
  if (!env.DB) throw new Error("Cloudflare D1 binding DB is unavailable");
  if (!initializing) {
    initializing = env.DB.batch(statements.map((sql) => env.DB.prepare(sql))).then(() => {
      initialized = true;
    });
  }
  await initializing;
}
