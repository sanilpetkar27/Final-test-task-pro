-- Add support for recurring reminder scheduling.
-- Stores the next UTC timestamp (ms) when a recurring task reminder should be sent.

ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS next_recurrence_notification_at BIGINT;

-- Backfill existing recurring tasks so reminders can start without manual edits.
UPDATE public.tasks
SET next_recurrence_notification_at = CASE recurrence_frequency
  WHEN 'daily' THEN COALESCE("createdAt", (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT) + 86400000
  WHEN 'weekly' THEN COALESCE("createdAt", (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT) + 604800000
  WHEN 'monthly' THEN COALESCE("createdAt", (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT) + 2592000000
  ELSE next_recurrence_notification_at
END
WHERE task_type = 'recurring'
  AND recurrence_frequency IN ('daily', 'weekly', 'monthly')
  AND next_recurrence_notification_at IS NULL;

-- One-time tasks should never keep a recurrence notification timestamp.
UPDATE public.tasks
SET next_recurrence_notification_at = NULL
WHERE task_type = 'one_time';

CREATE INDEX IF NOT EXISTS idx_tasks_next_recurrence_notification_at
  ON public.tasks(next_recurrence_notification_at)
  WHERE task_type = 'recurring';
