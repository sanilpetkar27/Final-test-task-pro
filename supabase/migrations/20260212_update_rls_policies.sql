-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own profile" ON employees;
DROP POLICY IF EXISTS "Users can update their own profile" ON employees;
DROP POLICY IF EXISTS "Users can insert employees" ON employees;
DROP POLICY IF EXISTS "Users can view tasks" ON tasks;
DROP POLICY IF EXISTS "Users can insert tasks" ON tasks;
DROP POLICY IF EXISTS "Users can update tasks" ON tasks;

-- Multi-tenant RLS policies for employees
CREATE POLICY "Users can view employees in their company" ON employees
    FOR SELECT USING (
        company_id = (
            SELECT company_id 
            FROM employees 
            WHERE auth_user_id = auth.uid()
            LIMIT 1
        )
    );

CREATE POLICY "Users can update their own profile in their company" ON employees
    FOR UPDATE USING (
        auth_user_id = auth.uid() AND
        company_id = (
            SELECT company_id 
            FROM employees 
            WHERE auth_user_id = auth.uid()
            LIMIT 1
        )
    );

CREATE POLICY "Users can insert employees in their company" ON employees
    FOR INSERT WITH CHECK (
        company_id = (
            SELECT company_id 
            FROM employees 
            WHERE auth_user_id = auth.uid()
            LIMIT 1
        )
    );

-- Multi-tenant RLS policies for tasks
CREATE POLICY "Users can view tasks in their company" ON tasks
    FOR SELECT USING (
        company_id = (
            SELECT company_id 
            FROM employees 
            WHERE auth_user_id = auth.uid()
            LIMIT 1
        )
    );

CREATE POLICY "Users can insert tasks in their company" ON tasks
    FOR INSERT WITH CHECK (
        company_id = (
            SELECT company_id 
            FROM employees 
            WHERE auth_user_id = auth.uid()
            LIMIT 1
        )
    );

CREATE POLICY "Users can update tasks in their company" ON tasks
    FOR UPDATE USING (
        company_id = (
            SELECT company_id 
            FROM employees 
            WHERE auth_user_id = auth.uid()
            LIMIT 1
        )
    );

-- RLS policies for companies (only super_admin can manage companies)
CREATE POLICY "Users can view their own company" ON companies
    FOR SELECT USING (
        id = (
            SELECT company_id 
            FROM employees 
            WHERE auth_user_id = auth.uid()
            LIMIT 1
        )
    );

CREATE POLICY "Super admins can insert companies" ON companies
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM employees 
            WHERE auth_user_id = auth.uid() 
            AND role = 'super_admin'
        )
    );

CREATE POLICY "Super admins can update companies" ON companies
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM employees 
            WHERE auth_user_id = auth.uid() 
            AND role = 'super_admin'
        )
    );
