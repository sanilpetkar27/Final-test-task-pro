-- Track per-user chat read timestamps for task and approval conversations.
-- Used by UI unread badges in task/approval tiles.

CREATE OR REPLACE FUNCTION public.current_employee_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  -- Preferred mapping: employees.id == auth.uid()
  SELECT e.id
    INTO v_employee_id
  FROM public.employees e
  WHERE e.id::text = auth.uid()::text
  LIMIT 1;

  -- Legacy mapping: employees.auth_user_id == auth.uid()
  IF v_employee_id IS NULL THEN
    BEGIN
      SELECT e.id
        INTO v_employee_id
      FROM public.employees e
      WHERE e.auth_user_id::text = auth.uid()::text
      LIMIT 1;
    EXCEPTION
      WHEN undefined_column THEN
        NULL;
    END;
  END IF;

  -- Fallback mapping: employees.email == auth.users.email
  IF v_employee_id IS NULL THEN
    BEGIN
      SELECT e.id
        INTO v_employee_id
      FROM public.employees e
      JOIN auth.users u ON lower(u.email) = lower(e.email)
      WHERE u.id = auth.uid()
      LIMIT 1;
    EXCEPTION
      WHEN undefined_column THEN
        NULL;
    END;
  END IF;

  RETURN v_employee_id;
END;
$$;

CREATE TABLE IF NOT EXISTS public.task_chat_reads (
  task_id text NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_chat_reads_pkey PRIMARY KEY (task_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.approval_chat_reads (
  approval_id uuid NOT NULL REFERENCES public.approvals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT approval_chat_reads_pkey PRIMARY KEY (approval_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_chat_reads_user_id
  ON public.task_chat_reads(user_id);

CREATE INDEX IF NOT EXISTS idx_task_chat_reads_task_id
  ON public.task_chat_reads(task_id);

CREATE INDEX IF NOT EXISTS idx_approval_chat_reads_user_id
  ON public.approval_chat_reads(user_id);

CREATE INDEX IF NOT EXISTS idx_approval_chat_reads_approval_id
  ON public.approval_chat_reads(approval_id);

CREATE OR REPLACE FUNCTION public.touch_read_receipt_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_chat_reads_touch_updated_at ON public.task_chat_reads;
CREATE TRIGGER trg_task_chat_reads_touch_updated_at
BEFORE UPDATE ON public.task_chat_reads
FOR EACH ROW
EXECUTE FUNCTION public.touch_read_receipt_updated_at();

DROP TRIGGER IF EXISTS trg_approval_chat_reads_touch_updated_at ON public.approval_chat_reads;
CREATE TRIGGER trg_approval_chat_reads_touch_updated_at
BEFORE UPDATE ON public.approval_chat_reads
FOR EACH ROW
EXECUTE FUNCTION public.touch_read_receipt_updated_at();

ALTER TABLE public.task_chat_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_chat_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_chat_reads_select_own ON public.task_chat_reads;
CREATE POLICY task_chat_reads_select_own
ON public.task_chat_reads
FOR SELECT
TO authenticated
USING (user_id = public.current_employee_id());

DROP POLICY IF EXISTS task_chat_reads_insert_own ON public.task_chat_reads;
CREATE POLICY task_chat_reads_insert_own
ON public.task_chat_reads
FOR INSERT
TO authenticated
WITH CHECK (user_id = public.current_employee_id());

DROP POLICY IF EXISTS task_chat_reads_update_own ON public.task_chat_reads;
CREATE POLICY task_chat_reads_update_own
ON public.task_chat_reads
FOR UPDATE
TO authenticated
USING (user_id = public.current_employee_id())
WITH CHECK (user_id = public.current_employee_id());

DROP POLICY IF EXISTS approval_chat_reads_select_own ON public.approval_chat_reads;
CREATE POLICY approval_chat_reads_select_own
ON public.approval_chat_reads
FOR SELECT
TO authenticated
USING (user_id = public.current_employee_id());

DROP POLICY IF EXISTS approval_chat_reads_insert_own ON public.approval_chat_reads;
CREATE POLICY approval_chat_reads_insert_own
ON public.approval_chat_reads
FOR INSERT
TO authenticated
WITH CHECK (user_id = public.current_employee_id());

DROP POLICY IF EXISTS approval_chat_reads_update_own ON public.approval_chat_reads;
CREATE POLICY approval_chat_reads_update_own
ON public.approval_chat_reads
FOR UPDATE
TO authenticated
USING (user_id = public.current_employee_id())
WITH CHECK (user_id = public.current_employee_id());
