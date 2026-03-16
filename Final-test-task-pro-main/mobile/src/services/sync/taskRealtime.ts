import { supabase } from '../api/supabase';

export function subscribeToCompanyTasks(companyId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`tasks-${companyId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter: `company_id=eq.${companyId}`,
      },
      () => onChange()
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

