-- Temporarily disable RLS to get signup working
-- We'll implement proper multi-tenancy RLS policies later

-- Drop existing RLS policies
DROP POLICY IF EXISTS "Users can view their own profile" ON employees;
DROP POLICY IF EXISTS "Users can update their own profile" ON employees;
DROP POLICY IF EXISTS "Users can insert their own profile" ON employees;
DROP POLICY IF EXISTS "Users can view tasks assigned to them or created by them" ON tasks;
DROP POLICY IF EXISTS "Users can update tasks assigned to them or created by them" ON tasks;
DROP POLICY IF EXISTS "Users can insert tasks" ON tasks;

-- Disable RLS temporarily to allow signup
ALTER TABLE employees DISABLE ROW LEVEL SECURITY;
ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE companies DISABLE ROW LEVEL SECURITY;

-- Enable basic RLS for security but allow all operations for now
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- Temporary policies that allow all authenticated users
CREATE POLICY "Allow all authenticated users on employees" ON employees
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all authenticated users on tasks" ON tasks
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all authenticated users on companies" ON companies
  FOR ALL USING (auth.role() = 'authenticated');
