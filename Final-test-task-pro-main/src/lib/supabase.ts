import { createClient } from '@supabase/supabase-js'

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
if (!supabaseUrl) {
  throw new Error('Missing required environment variable: VITE_SUPABASE_URL');
}

const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
if (!supabaseAnonKey) {
  throw new Error('Missing required environment variable: VITE_SUPABASE_ANON_KEY');
}

const DEFAULT_WEB_APP_URL = 'https://opentask.in';
const configuredWebAppUrl = String(import.meta.env.VITE_APP_URL || '').trim();

export const publicAppUrl =
  configuredWebAppUrl ||
  (typeof window !== 'undefined' ? window.location.origin : DEFAULT_WEB_APP_URL);

// Check if we have real Supabase credentials
const hasRealCredentials = () =>
  !supabaseUrl.toLowerCase().includes('demo') && supabaseAnonKey !== 'demo-key';

if (import.meta.env.PROD && !hasRealCredentials()) {
  throw new Error(
    'Production build requires valid Supabase credentials. ' +
      'Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.'
  );
}

if (import.meta.env.DEV && !hasRealCredentials()) {
  console.warn(
    '\u26A0\uFE0F  Using mock Supabase client (development mode)\n' +
      'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env for real database connection'
  );
}

// Create a comprehensive mock client
const createMockClient = () => {
  const mockData = {
    employees: [
      { id: 'emp-admin', name: 'Admin User', mobile: '9000000001', role: 'manager' },
      { id: 'emp-staff-1', name: 'Staff Member 1', mobile: '8888888888', role: 'staff' },
      { id: 'emp-staff-2', name: 'Staff Member 2', mobile: '7777777777', role: 'staff' }
    ],
    tasks: [
      { id: 'task-demo-1', description: 'Welcome to Universal Task App - Demo Mode', status: 'pending', created_at: new Date().toISOString(), assigned_by: 'emp-admin', assigned_to: 'emp-staff-1' },
      { id: 'task-demo-2', description: 'Try creating a new task', status: 'pending', created_at: new Date().toISOString(), assigned_by: 'emp-admin', assigned_to: null }
    ]
  };

  return {
    from: (table: string) => ({
      select: () => Promise.resolve({ 
        data: mockData[table as keyof typeof mockData] || [], 
        error: null 
      }),
      insert: () => Promise.resolve({ 
        data: null, 
        error: null 
      }),
      update: () => Promise.resolve({ 
        data: null, 
        error: null 
      }),
      upsert: () => Promise.resolve({ 
        data: mockData[table as keyof typeof mockData]?.[0] || null, 
        error: null 
      }),
      delete: () => Promise.resolve({ 
        data: null, 
        error: null 
      }),
      eq: () => ({
        select: () => Promise.resolve({ 
          data: mockData[table as keyof typeof mockData]?.[0] || null, 
          error: null 
        }),
        single: () => Promise.resolve({ 
          data: mockData[table as keyof typeof mockData]?.[0] || null, 
          error: null 
        })
      })
    }),
    channel: (channelName: string) => {
      console.log('📡 Mock channel created:', channelName);
      return {
        on: (event: string, config: any, callback?: Function) => {
          console.log('📡 Mock subscription setup:', event, config);
          // Simulate a subscription that does nothing
          return {
            subscribe: () => {
              console.log('📡 Mock subscription active');
              return {
                unsubscribe: () => console.log('📡 Mock subscription unsubscribed')
              };
            }
          };
        }
      };
    },
    removeChannel: () => {},
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: { path: 'mock-path' }, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: 'https://via.placeholder.com/300' } })
      })
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
    auth: {
      signInWithPassword: () => Promise.resolve({ data: { user: null }, error: null }),
      signUp: () => Promise.resolve({ data: { user: { id: 'mock-user-id' } }, error: null }),
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      signOut: () => Promise.resolve({ error: null }),
    },
    functions: {
      invoke: () => Promise.resolve({ data: { mocked: true }, error: null }),
    },
  };
};

// Use a single real client instance to avoid multiple GoTrueClient warnings and session races.
const realClient = hasRealCredentials()
  ? createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
          flowType: 'pkce',
        },
      }
    )
  : null;

// Use real client if credentials exist, otherwise use mock
export const supabase = realClient ?? createMockClient();

// Export auth from the same client instance.
export const supabaseAuth = realClient ? realClient.auth : createMockClient().auth;

