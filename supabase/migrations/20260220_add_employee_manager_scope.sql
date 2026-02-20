-- Add manager ownership scope so each manager can have an isolated team.
-- Super admins/owners can still view all members in the company (frontend policy).

ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS manager_id text;

CREATE INDEX IF NOT EXISTS idx_employees_company_manager
  ON public.employees(company_id, manager_id);

-- Ensure staff created by a manager is automatically linked to that manager
-- when manager_id is not explicitly provided.
CREATE OR REPLACE FUNCTION public.ensure_employee_manager_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_employee_id text;
BEGIN
  IF NEW.role IS DISTINCT FROM 'staff' THEN
    RETURN NEW;
  END IF;

  IF NEW.manager_id IS NOT NULL AND length(trim(NEW.manager_id)) > 0 THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Try modern profile link first (employees.id = auth.uid()).
  SELECT e.id
    INTO actor_employee_id
  FROM public.employees e
  WHERE e.id::text = auth.uid()::text
    AND e.company_id = NEW.company_id
    AND e.role = 'manager'
  LIMIT 1;

  -- Fallback: legacy profile link (employees.auth_user_id = auth.uid()).
  IF actor_employee_id IS NULL THEN
    BEGIN
      SELECT e.id
        INTO actor_employee_id
      FROM public.employees e
      WHERE e.auth_user_id::text = auth.uid()::text
        AND e.company_id = NEW.company_id
        AND e.role = 'manager'
      LIMIT 1;
    EXCEPTION
      WHEN undefined_column THEN
        NULL;
    END;
  END IF;

  IF actor_employee_id IS NOT NULL THEN
    NEW.manager_id := actor_employee_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employees_ensure_manager_scope ON public.employees;

CREATE TRIGGER trg_employees_ensure_manager_scope
BEFORE INSERT ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.ensure_employee_manager_scope();
