-- Add company_id column to employees table
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

-- Set all existing employees to the default company
UPDATE employees 
SET company_id = '00000000-0000-0000-0000-000000000001' 
WHERE company_id IS NULL;

-- Make company_id NOT NULL after migration
ALTER TABLE employees 
ALTER COLUMN company_id SET NOT NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_employees_company_id ON employees(company_id);
