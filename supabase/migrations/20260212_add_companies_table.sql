-- Create companies table for multi-tenancy
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    subscription_status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create default company for existing data
INSERT INTO companies (id, name, subscription_status)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Main Company',
    'active'
)
ON CONFLICT (id) DO NOTHING;
