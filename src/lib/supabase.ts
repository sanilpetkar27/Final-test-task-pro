import { createClient } from '@supabase/supabase-js'

// Fallback values for deployment
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://demo.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'demo-key'

// Create a mock client if no real credentials
const createMockClient = () => ({
  from: () => ({
    select: () => Promise.resolve({ data: null, error: new Error('Demo mode') }),
    insert: () => Promise.resolve({ data: null, error: new Error('Demo mode') }),
    update: () => Promise.resolve({ data: null, error: new Error('Demo mode') }),
    delete: () => Promise.resolve({ data: null, error: new Error('Demo mode') })
  }),
  channel: () => ({
    on: () => ({ subscribe: () => {} })
  }),
  removeChannel: () => {}
})

export const supabase = (supabaseUrl === 'https://demo.supabase.co') 
  ? createMockClient() 
  : createClient(supabaseUrl, supabaseAnonKey)
