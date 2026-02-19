import { supabase } from '../../../services/api/supabase';
import type { TeamMember, UserRole } from '../../../types/domain';

const normalizeRole = (role: unknown): UserRole => {
  return role === 'super_admin' || role === 'owner' || role === 'manager' || role === 'staff' ? role : 'staff';
};

const mapMember = (row: any): TeamMember => ({
  id: String(row?.id || ''),
  companyId: String(row?.company_id || ''),
  name: String(row?.name || 'Unknown'),
  email: String(row?.email || ''),
  mobile: String(row?.mobile || ''),
  role: normalizeRole(row?.role),
  points: Number(row?.points || 0),
  onesignalId: row?.onesignal_id ? String(row.onesignal_id) : null,
});

export const teamRepository = {
  async listMembers(companyId: string): Promise<TeamMember[]> {
    const { data, error } = await supabase.from('employees').select('*').eq('company_id', companyId);
    if (error) throw error;
    return (data || [])
      .map(mapMember)
      .sort((left, right) => left.name.localeCompare(right.name));
  },
};

