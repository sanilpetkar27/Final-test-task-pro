ALTER TABLE public.approvals
ADD COLUMN IF NOT EXISTS task_id text REFERENCES public.tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_approvals_task_id
  ON public.approvals(task_id);
