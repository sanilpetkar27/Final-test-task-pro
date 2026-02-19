import type { UserRole } from '../types/domain';

const managementRoles: UserRole[] = ['super_admin', 'owner', 'manager'];

export const canManageTeam = (role: UserRole) => managementRoles.includes(role);

export const canAssignTasks = (role: UserRole) => role === 'super_admin' || role === 'owner' || role === 'manager';

export const isStaffOnly = (role: UserRole) => role === 'staff';
