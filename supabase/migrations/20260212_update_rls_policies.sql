-- Drop existing RLS policies
DROP POLICY IF EXISTS "Users can view their own profile" ON employees;
DROP POLICY IF EXISTS "Users can update their own profile" ON employees;
DROP POLICY IF EXISTS "Users can insert their own profile" ON employees;
DROP POLICY IF EXISTS "Users can view tasks assigned to them or created by them" ON tasks;
DROP POLICY IF EXISTS "Users can update tasks assigned to them or created by them" ON tasks;
DROP POLICY IF EXISTS "Users can insert tasks" ON tasks;

-- Enable RLS on companies table
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for multi-tenancy
CREATE POLICY "Company users can view their company" ON companies
  FOR SELECT USING (
    id = (SELECT company_id::uuid FROM employees WHERE id = auth.uid()::text)
  );

CREATE POLICY "Company users can update their company" ON companies
  FOR UPDATE USING (
    id = (SELECT company_id::uuid FROM employees WHERE id = auth.uid()::text)
  );

CREATE POLICY "Company users can insert into their company" ON companies
  FOR INSERT WITH CHECK (
    id = (SELECT company_id::uuid FROM employees WHERE id = auth.uid()::text)
  );

-- Update employees RLS policies for multi-tenancy
CREATE POLICY "Users can view employees in their company" ON employees
  FOR SELECT USING (
    company_id = (SELECT company_id::uuid FROM employees WHERE id = auth.uid()::text)
  );

CREATE POLICY "Users can update employees in their company" ON employees
  FOR UPDATE USING (
    company_id = (SELECT company_id::uuid FROM employees WHERE id = auth.uid()::text)
  );

CREATE POLICY "Users can insert employees in their company" ON employees
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id::uuid FROM employees WHERE id = auth.uid()::text)
  );

-- Update tasks RLS policies for multi-tenancy
CREATE POLICY "Users can view tasks in their company" ON tasks
  FOR SELECT USING (
    company_id = (SELECT company_id::uuid FROM employees WHERE id = auth.uid()::text)
  );

CREATE POLICY "Users can update tasks in their company" ON tasks
  FOR UPDATE USING (
    company_id = (SELECT company_id::uuid FROM employees WHERE id = auth.uid()::text)
  );

CREATE POLICY "Users can insert tasks in their company" ON tasks
  FOR INSERT WITH CHECK (
    company_id = (SELECT company_id::uuid FROM employees WHERE id = auth.uid()::text)
  );

-- RLS policies for companies (only super_admin can manage companies)
CREATE POLICY "Users can view their own company" ON companies
    FOR SELECT USING (
        id = (
            SELECT company_id::uuid 
            SELECT company_id 
            FROM employees 
            WHERE id = auth.uid()
            LIMIT 1
        )
    );

CREATE POLICY "Super admins can insert companies" ON companies
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM employees 
            WHERE id = auth.uid() 
            AND role = 'super_admin'
        )
    );

CREATE POLICY "Super admins can update companies" ON companies
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM employees 
            WHERE id = auth.uid() 
            AND role = 'super_admin'
        )
    );
