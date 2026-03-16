-- Fix: ensure employees.company_id is always populated during inserts.
-- This protects legacy RPC paths that still insert employees without company_id.

CREATE OR REPLACE FUNCTION public.ensure_employee_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_company_id uuid;
  actor_company_text text;
BEGIN
  -- Respect explicit company_id when provided by caller.
  IF NEW.company_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Try to inherit the active authenticated user's tenant.
  IF auth.uid() IS NOT NULL THEN
    -- 1) Modern profile link: employees.id equals auth uid.
    BEGIN
      SELECT e.company_id
        INTO actor_company_id
      FROM public.employees e
      WHERE e.id::text = auth.uid()::text
      LIMIT 1;
    EXCEPTION
      WHEN undefined_column THEN
        NULL;
    END;

    -- 2) Legacy profile link: employees.auth_user_id equals auth uid.
    IF actor_company_id IS NULL THEN
      BEGIN
        SELECT e.company_id
          INTO actor_company_id
        FROM public.employees e
        WHERE e.auth_user_id::text = auth.uid()::text
        LIMIT 1;
      EXCEPTION
        WHEN undefined_column THEN
          NULL;
      END;
    END IF;

    -- 3) Auth metadata fallback.
    IF actor_company_id IS NULL THEN
      SELECT NULLIF(u.raw_user_meta_data ->> 'company_id', '')
        INTO actor_company_text
      FROM auth.users u
      WHERE u.id = auth.uid()
      LIMIT 1;

      BEGIN
        actor_company_id := actor_company_text::uuid;
      EXCEPTION
        WHEN others THEN
          actor_company_id := NULL;
      END;
    END IF;
  END IF;

  -- Final fallback to default tenant to satisfy NOT NULL and prevent hard failures.
  NEW.company_id := COALESCE(
    actor_company_id,
    '00000000-0000-0000-0000-000000000001'::uuid
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employees_ensure_company_id ON public.employees;

CREATE TRIGGER trg_employees_ensure_company_id
BEFORE INSERT ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.ensure_employee_company_id();
