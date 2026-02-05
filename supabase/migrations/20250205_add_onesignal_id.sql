-- Migration: Add OneSignal ID column to employees table
-- Purpose: Store OneSignal Player ID for push notifications

-- ============================================
-- STEP 1: Add onesignal_id column to employees table
-- ============================================
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS onesignal_id TEXT NULL;

-- ============================================
-- STEP 2: Create index for faster lookups
-- ============================================
CREATE INDEX IF NOT EXISTS idx_employees_onesignal_id 
ON employees(onesignal_id) 
WHERE onesignal_id IS NOT NULL;

-- ============================================
-- NOTES:
-- ============================================
-- - onesignal_id stores the OneSignal Player ID (subscription ID)
-- - Nullable because not all users may enable notifications
-- - Index helps quickly find users by their device ID for targeted notifications
