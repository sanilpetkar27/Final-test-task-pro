const requiredVars = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
];

export const validateEnv = (): void => {
  const missing = requiredVars.filter((key) => {
    const value = (import.meta.env as Record<string, string | undefined>)[key];
    return !String(value || '').trim();
  });

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};
