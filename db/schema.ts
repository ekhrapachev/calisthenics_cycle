import { integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  gender: text("gender").notNull(),
  birthDate: text("birth_date").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const passwordResetTokens = sqliteTable("password_reset_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const progressionSelections = sqliteTable(
  "progression_selections",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    scope: text("workout_type").notNull(),
    exerciseKey: text("exercise_key").notNull(),
    progression: text("progression").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.scope, table.exerciseKey] })],
);

export const workoutRoutineProfiles = sqliteTable("workout_routine_profiles", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  initializedAt: integer("initialized_at").notNull(),
});

export const workoutRoutines = sqliteTable("workout_routines", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  difficulty: text("difficulty").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const workoutRoutineExercises = sqliteTable(
  "workout_routine_exercises",
  {
    routineId: text("routine_id").notNull().references(() => workoutRoutines.id, { onDelete: "cascade" }),
    exerciseKey: text("exercise_key").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [primaryKey({ columns: [table.routineId, table.exerciseKey] })],
);

export const workoutSessions = sqliteTable("workout_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  workoutType: text("workout_type").notNull(),
  status: text("status").notNull().default("active"),
  startedAt: integer("started_at").notNull(),
  completedAt: integer("completed_at"),
  durationSeconds: integer("duration_seconds"),
});

export const workoutSessionSnapshots = sqliteTable("workout_session_snapshots", {
  workoutSessionId: text("workout_session_id").primaryKey().references(() => workoutSessions.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  routineId: text("routine_id"),
  routineName: text("routine_name").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  difficulty: text("difficulty").notNull(),
  exercisesJson: text("exercises_json").notNull(),
});

export const workoutSets = sqliteTable(
  "workout_sets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    workoutSessionId: text("workout_session_id").notNull().references(() => workoutSessions.id, { onDelete: "cascade" }),
    exerciseKey: text("exercise_key").notNull(),
    progression: text("progression").notNull(),
    setNumber: integer("set_number").notNull(),
    targetValue: integer("target_value").notNull(),
    actualValue: integer("actual_value").notNull(),
    unit: text("unit").notNull(),
    effort: text("effort"),
    completedAt: integer("completed_at").notNull(),
  },
  (table) => [
    uniqueIndex("workout_sets_session_exercise_set_idx").on(
      table.workoutSessionId,
      table.exerciseKey,
      table.setNumber,
    ),
  ],
);
