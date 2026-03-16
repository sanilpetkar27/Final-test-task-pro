-- Fix: Remove recursive RLS policies that trigger 42P17 on employees/tasks/companies
-- Safe temporary policy set for authenticated users.

DO $$
DECLARE
  policy_record RECORD;
BEGIN
  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'employees'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.employees', policy_record.policyname);
  END LOOP;

  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tasks'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.tasks', policy_record.policyname);
  END LOOP;

  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'companies'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.companies', policy_record.policyname);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.is_super_admin();
DROP FUNCTION IF EXISTS public.get_employee_id_from_auth();

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY employees_authenticated_all
  ON public.employees
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY tasks_authenticated_all
  ON public.tasks
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY companies_authenticated_all
  ON public.companies
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
