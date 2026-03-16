-- Introduce many-to-many manager ownership for staff members.
-- This table allows one staff member to belong to multiple managers.

CREATE TABLE IF NOT EXISTS public.staff_manager_links (
  company_id uuid NOT NULL,
  staff_id text NOT NULL,
  manager_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT staff_manager_links_pkey PRIMARY KEY (company_id, staff_id, manager_id),
  CONSTRAINT staff_manager_links_staff_not_manager CHECK (staff_id <> manager_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_manager_links_company_staff
  ON public.staff_manager_links (company_id, staff_id);

CREATE INDEX IF NOT EXISTS idx_staff_manager_links_company_manager
  ON public.staff_manager_links (company_id, manager_id);

CREATE OR REPLACE FUNCTION public.touch_staff_manager_links_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_manager_links_touch_updated_at ON public.staff_manager_links;

CREATE TRIGGER trg_staff_manager_links_touch_updated_at
BEFORE UPDATE ON public.staff_manager_links
FOR EACH ROW
EXECUTE FUNCTION public.touch_staff_manager_links_updated_at();

-- Backfill existing single-manager ownership into the junction table.
INSERT INTO public.staff_manager_links (company_id, staff_id, manager_id)
SELECT
  e.company_id,
  e.id::text,
  e.manager_id::text
FROM public.employees e
WHERE e.role = 'staff'
  AND e.company_id IS NOT NULL
  AND e.manager_id IS NOT NULL
  AND length(trim(e.manager_id)) > 0
ON CONFLICT (company_id, staff_id, manager_id) DO NOTHING;

ALTER TABLE public.staff_manager_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all authenticated users on staff_manager_links" ON public.staff_manager_links;

CREATE POLICY "Allow all authenticated users on staff_manager_links"
ON public.staff_manager_links
FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');
