-- Add company_id column to tasks table
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

-- Set all existing tasks to the default company
UPDATE tasks 
SET company_id = '00000000-0000-0000-0000-000000000001' 
WHERE company_id IS NULL;

-- Make company_id NOT NULL after migration
ALTER TABLE tasks 
ALTER COLUMN company_id SET NOT NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_tasks_company_id ON tasks(company_id);
