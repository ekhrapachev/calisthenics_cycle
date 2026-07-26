CREATE TABLE `workout_routine_exercises` (
	`routine_id` text NOT NULL,
	`exercise_key` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`routine_id`, `exercise_key`),
	FOREIGN KEY (`routine_id`) REFERENCES `workout_routines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workout_routine_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`initialized_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workout_routines` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`difficulty` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workout_session_snapshots` (
	`workout_session_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`routine_id` text,
	`routine_name` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`difficulty` text NOT NULL,
	`exercises_json` text NOT NULL,
	FOREIGN KEY (`workout_session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
