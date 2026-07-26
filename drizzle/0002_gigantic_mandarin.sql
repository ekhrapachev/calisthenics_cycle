UPDATE `workout_sessions`
SET `status` = 'superseded'
WHERE `status` = 'active'
  AND `id` NOT IN (
    SELECT (
      SELECT latest.`id`
      FROM `workout_sessions` latest
      WHERE latest.`user_id` = users_with_active.`user_id`
        AND latest.`status` = 'active'
      ORDER BY latest.`started_at` DESC, latest.`id` DESC
      LIMIT 1
    )
    FROM `workout_sessions` users_with_active
    WHERE users_with_active.`status` = 'active'
    GROUP BY users_with_active.`user_id`
  );--> statement-breakpoint
CREATE INDEX `workout_sessions_user_status_idx` ON `workout_sessions` (`user_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `workout_sessions_one_active_user_idx` ON `workout_sessions` (`user_id`) WHERE "workout_sessions"."status" = 'active';
