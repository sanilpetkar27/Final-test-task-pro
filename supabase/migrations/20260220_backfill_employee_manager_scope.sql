-- Backfill manager_id for existing staff so manager-level team isolation works immediately.
-- Strategy:
-- 1) Use most recent task assignment (assignedBy -> assignedTo) where assigner is a manager.
-- 2) If still null and company has exactly one manager, assign that manager.

WITH ranked_assignments AS (
  SELECT
    t."assignedTo"::text AS staff_id,
    t."assignedBy"::text AS manager_id,
    ROW_NUMBER() OVER (
      PARTITION BY t."assignedTo"
      ORDER BY COALESCE(t."createdAt", t."completedAt", 0) DESC
    ) AS rn
  FROM public.tasks t
  JOIN public.employees manager_emp
    ON manager_emp.id::text = t."assignedBy"::text
   AND manager_emp.role = 'manager'
   AND manager_emp.company_id = t.company_id
  JOIN public.employees staff_emp
    ON staff_emp.id::text = t."assignedTo"::text
   AND staff_emp.role = 'staff'
   AND staff_emp.company_id = t.company_id
  WHERE t."assignedTo" IS NOT NULL
    AND t."assignedBy" IS NOT NULL
    AND t.company_id IS NOT NULL
)
UPDATE public.employees staff
SET manager_id = ra.manager_id
FROM ranked_assignments ra
WHERE staff.id::text = ra.staff_id
  AND staff.role = 'staff'
  AND (staff.manager_id IS NULL OR length(trim(staff.manager_id)) = 0)
  AND ra.rn = 1;

WITH single_manager_per_company AS (
  SELECT
    e.company_id,
    MIN(e.id::text) AS manager_id
  FROM public.employees e
  WHERE e.role = 'manager'
  GROUP BY e.company_id
  HAVING COUNT(*) = 1
)
UPDATE public.employees staff
SET manager_id = sm.manager_id
FROM single_manager_per_company sm
WHERE staff.company_id = sm.company_id
  AND staff.role = 'staff'
  AND (staff.manager_id IS NULL OR length(trim(staff.manager_id)) = 0);
