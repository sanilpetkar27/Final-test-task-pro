-- Add remarks column to tasks table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name='tasks' 
        AND column_name='remarks'
    ) THEN
        ALTER TABLE tasks ADD COLUMN remarks JSONB DEFAULT '[]'::jsonb;
        RAISE NOTICE 'Column remarks added to tasks table';
    ELSE
        RAISE NOTICE 'Column remarks already exists in tasks table';
    END IF;
END $$;
