import { createClient } from '@supabase/supabase-js';

// Hardcoded to bypass Metro bundler .env caching issues
const supabaseUrl = 'https://xdvybqfivmzfddmszqqk.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkdnlicWZpdm16ZmRkbXN6cXFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4MTg5NzIsImV4cCI6MjA4NDM5NDk3Mn0.epy-lf0p77HsT9PDRTQiGNXxiKEouqCE3ULmT93nWlM';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
