-- Migration: Smart RLS Policy for Task Visibility with ID Mapping
-- Issue: employees.id is custom string (e.g., emp-123), NOT Supabase Auth UUID
-- Solution: Map auth.uid() to employee record via phone number matching

-- ============================================
-- STEP 1: Enable RLS on tasks table (if not already enabled)
-- ============================================
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 2: Drop existing policies to avoid conflicts
-- ============================================
DROP POLICY IF EXISTS "Users can view their own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can view assigned tasks" ON tasks;
DROP POLICY IF EXISTS "Super admin can view all tasks" ON tasks;
DROP POLICY IF EXISTS "Managers can view all tasks" ON tasks;
DROP POLICY IF EXISTS "Task visibility policy" ON tasks;

-- ============================================
-- STEP 3: Create helper function to get employee ID from auth user
-- ============================================
CREATE OR REPLACE FUNCTION get_employee_id_from_auth()
RETURNS TEXT AS $$
DECLARE
    employee_id TEXT;
    user_phone TEXT;
BEGIN
    -- Get the phone number from auth user metadata
    -- Supabase stores phone in raw_user_meta_data->>'phone'
    user_phone := (
        SELECT raw_user_meta_data->>'phone' 
        FROM auth.users 
        WHERE id = auth.uid()
    );
    
    -- If phone not in metadata, try email (as fallback)
    IF user_phone IS NULL OR user_phone = '' THEN
        user_phone := (
            SELECT email 
            FROM auth.users 
            WHERE id = auth.uid()
        );
    END IF;
    
    -- Clean phone number: remove +91 prefix and any non-digit characters
    IF user_phone IS NOT NULL THEN
        -- Remove +91, +, spaces, dashes
        user_phone := regexp_replace(user_phone, '^\+91', '');
        user_phone := regexp_replace(user_phone, '[^0-9]', '', 'g');
    END IF;
    
    -- Find employee record by matching phone (also cleaned)
    SELECT e.id INTO employee_id
    FROM employees e
    WHERE regexp_replace(e.mobile, '[^0-9]', '', 'g') = user_phone
    LIMIT 1;
    
    RETURN employee_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- STEP 4: Create helper function to check if user is super_admin
-- ============================================
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
DECLARE
    employee_role TEXT;
BEGIN
    SELECT e.role INTO employee_role
    FROM employees e
    WHERE e.id = get_employee_id_from_auth();
    
    RETURN employee_role = 'super_admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- STEP 5: Create the smart RLS policy for SELECT
-- ============================================
CREATE POLICY "Smart task visibility policy" ON tasks
    FOR SELECT
    USING (
        -- Super Admin: Can see ALL tasks
        is_super_admin() = TRUE
        
        OR
        
        -- Regular Users: Can only see tasks where they are assignee OR creator
        -- This handles the ID mismatch via our helper function
        (
            "assignedTo" = get_employee_id_from_auth()
            OR 
            "assignedBy" = get_employee_id_from_auth()
        )
    );

-- ============================================
-- STEP 6: Create policy for INSERT (users can create tasks)
-- ============================================
CREATE POLICY "Users can create tasks" ON tasks
    FOR INSERT
    WITH CHECK (
        is_super_admin() = TRUE
        OR 
        "assignedBy" = get_employee_id_from_auth()
    );

-- ============================================
-- STEP 7: Create policy for UPDATE (users can update their own tasks)
-- ============================================
CREATE POLICY "Users can update their tasks" ON tasks
    FOR UPDATE
    USING (
        is_super_admin() = TRUE
        OR 
        "assignedTo" = get_employee_id_from_auth()
        OR 
        "assignedBy" = get_employee_id_from_auth()
    )
    WITH CHECK (
        is_super_admin() = TRUE
        OR 
        "assignedTo" = get_employee_id_from_auth()
        OR 
        "assignedBy" = get_employee_id_from_auth()
    );

-- ============================================
-- STEP 8: Create policy for DELETE (only super_admin or creator can delete)
-- ============================================
CREATE POLICY "Users can delete their tasks" ON tasks
    FOR DELETE
    USING (
        is_super_admin() = TRUE
        OR 
        "assignedBy" = get_employee_id_from_auth()
    );

-- ============================================
-- STEP 9: Verify the setup (optional - run these to test)
-- ============================================

-- Test: Check if function works for current user
-- SELECT get_employee_id_from_auth();

-- Test: Check if super_admin function works
-- SELECT is_super_admin();

-- Test: See what tasks current user can see
-- SELECT * FROM tasks WHERE (
--     is_super_admin() = TRUE
--     OR 
--     "assignedTo" = get_employee_id_from_auth()
--     OR 
--     "assignedBy" = get_employee_id_from_auth()
-- );

-- ============================================
-- NOTES FOR DEBUGGING:
-- ============================================
-- If the policy doesn't work, check:
-- 1. Does auth.users.raw_user_meta_data->>'phone' contain the phone number?
-- 2. Does employees.mobile match the phone format (with or without +91)?
-- 3. Are the column names correct (assignee_id vs assigned_to vs assigned_by)?
-- 4. Run: SELECT * FROM auth.users WHERE id = auth.uid();
-- 5. Run: SELECT * FROM employees WHERE mobile = 'YOUR_PHONE';
-- ============================================
