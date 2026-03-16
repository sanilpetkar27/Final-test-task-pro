-- Add remarks column to tasks table
ALTER TABLE tasks ADD COLUMN remarks JSONB DEFAULT '[]'::jsonb;

-- Add comment to describe the remarks column
COMMENT ON COLUMN tasks.remarks IS 'Array of task progress remarks/updates';
