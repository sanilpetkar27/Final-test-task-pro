-- Add recurrence support to tasks.
-- This is schema-level validation that enforces:
-- 1) task_type is one_time or recurring
-- 2) recurring tasks must have recurrence_frequency
-- 3) one_time tasks must keep recurrence_frequency as null

ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS task_type TEXT;

ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS recurrence_frequency TEXT;

-- Backfill existing rows to one_time.
UPDATE public.tasks
SET task_type = COALESCE(task_type, 'one_time')
WHERE task_type IS NULL;

-- Ensure one_time tasks don't carry recurrence_frequency accidentally.
UPDATE public.tasks
SET recurrence_frequency = NULL
WHERE task_type = 'one_time';

ALTER TABLE public.tasks
ALTER COLUMN task_type SET DEFAULT 'one_time';

ALTER TABLE public.tasks
ALTER COLUMN task_type SET NOT NULL;

ALTER TABLE public.tasks
DROP CONSTRAINT IF EXISTS tasks_task_type_check;

ALTER TABLE public.tasks
ADD CONSTRAINT tasks_task_type_check
CHECK (task_type IN ('one_time', 'recurring'));

ALTER TABLE public.tasks
DROP CONSTRAINT IF EXISTS tasks_recurrence_frequency_check;

ALTER TABLE public.tasks
ADD CONSTRAINT tasks_recurrence_frequency_check
CHECK (
  recurrence_frequency IS NULL
  OR recurrence_frequency IN ('daily', 'weekly', 'monthly')
);

ALTER TABLE public.tasks
DROP CONSTRAINT IF EXISTS tasks_task_type_recurrence_consistency_check;

ALTER TABLE public.tasks
ADD CONSTRAINT tasks_task_type_recurrence_consistency_check
CHECK (
  (task_type = 'one_time' AND recurrence_frequency IS NULL)
  OR
  (task_type = 'recurring' AND recurrence_frequency IN ('daily', 'weekly', 'monthly'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_task_type ON public.tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_tasks_recurrence_frequency ON public.tasks(recurrence_frequency);
