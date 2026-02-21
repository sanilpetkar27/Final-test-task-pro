
import React, { useState, useEffect, useMemo } from 'react';
import { Employee, UserRole, RewardConfig, StaffManagerLink } from '../types';
import { UserPlus, Trash2, User, ShieldCheck, Phone, Trophy, Target, Star, Medal, RefreshCw, Wifi } from 'lucide-react';
import { supabase } from '../src/lib/supabase';
import { toast } from 'sonner';

interface TeamManagerProps {
  employees: Employee[];
  staffManagerLinks: StaffManagerLink[];
  currentUser: Employee;
  onAddEmployee: (name: string, mobile: string, role: UserRole, managerId?: string | null) => void;
  onRemoveEmployee: (id: string) => void;
  onUpdateStaffManagers: (staffId: string, managerIds: string[]) => Promise<boolean>;
  rewardConfig: RewardConfig;
  onUpdateRewardConfig: (config: RewardConfig) => void;
  isSuperAdmin: boolean;
  setEmployees?: (employees: Employee[]) => void;
}

const extractMissingColumnName = (error: any): string | null => {
  const message = String(error?.message || '').toLowerCase();
  if (!message) return null;

  const schemaCacheMatch = message.match(/could not find the ['"]?([a-z0-9_]+)['"]?\s+column/);
  if (schemaCacheMatch?.[1]) {
    return schemaCacheMatch[1];
  }

  const relationMatch = message.match(/column ['"]?([a-z0-9_]+)['"]?\s+of relation/);
  if (relationMatch?.[1]) {
    return relationMatch[1];
  }

  const genericMatch = message.match(/column ['"]?([a-z0-9_]+)['"]?\s+does not exist/);
  if (genericMatch?.[1]) {
    return genericMatch[1];
  }

  return null;
};

const isMissingColumnError = (error: any): boolean => {
  const message = String(error?.message || '').toLowerCase();
  if (!message) return false;

  return Boolean(
    extractMissingColumnName(error) ||
    message.includes('schema cache') ||
    (message.includes('column') && message.includes('does not exist'))
  );
};

const isMissingSpecificColumnError = (error: any, columnName: string): boolean => {
  const missingColumn = extractMissingColumnName(error);
  if (missingColumn) {
    return missingColumn === columnName.toLowerCase();
  }

  const message = String(error?.message || '').toLowerCase();
  return message.includes(columnName.toLowerCase()) && isMissingColumnError(error);
};

const removeMissingColumnFromPayload = (
  payload: Record<string, any>,
  error: any
): Record<string, any> | null => {
  const missingColumn = extractMissingColumnName(error);
  if (missingColumn && Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
    const nextPayload = { ...payload };
    delete nextPayload[missingColumn];
    return nextPayload;
  }

  // Fallback in case backend returns non-standard missing-column wording.
  const fallbackColumns = ['email', 'manager_id', 'points', 'updated_at', 'auth_user_id'];
  const lowerMessage = String(error?.message || '').toLowerCase();
  for (const column of fallbackColumns) {
    if (lowerMessage.includes(column) && Object.prototype.hasOwnProperty.call(payload, column)) {
      const nextPayload = { ...payload };
      delete nextPayload[column];
      return nextPayload;
    }
  }

  return null;
};

const getRoleLabel = (role: UserRole): string => {
  if (role === 'super_admin' || role === 'owner') return 'Owner';
  if (role === 'manager') return 'Manager';
  return 'Staff';
};

const TeamManager: React.FC<TeamManagerProps> = ({ 
  employees, 
  staffManagerLinks,
  currentUser, 
  onAddEmployee, 
  onRemoveEmployee, 
  onUpdateStaffManagers,
  onUpdateRewardConfig,
  rewardConfig,
  isSuperAdmin,
  setEmployees // ✅ Use this prop for state updates
}) => {
  // Feature flag - set to true to show points system
  const SHOW_POINTS_SYSTEM = false;
  
  
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newMobile, setNewMobile] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('staff');
  const [selectedManagerIds, setSelectedManagerIds] = useState<string[]>([]);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [editingManagerIds, setEditingManagerIds] = useState<string[]>([]);
  const [isSavingManagers, setIsSavingManagers] = useState(false);
  const [targetPoints, setTargetPoints] = useState(rewardConfig.targetPoints.toString());
  const [rewardName, setRewardName] = useState(rewardConfig.rewardName);
  const [isAdding, setIsAdding] = useState(false);
  const canAddMembers = ['super_admin', 'manager', 'owner'].includes(currentUser.role);
  const canAssignMultipleManagers =
    currentUser.role === 'super_admin' || currentUser.role === 'owner' || isSuperAdmin;
  const requiresManagerSelection = canAssignMultipleManagers && newRole === 'staff';

  const assignableRoles = useMemo<UserRole[]>(() => {
    if (currentUser.role === 'super_admin' || currentUser.role === 'owner') {
      return ['super_admin', 'manager', 'staff'];
    }

    if (currentUser.role === 'manager') {
      return ['staff'];
    }

    return [];
  }, [currentUser.role]);

  const managerOptions = useMemo<Employee[]>(() => {
    const uniqueManagers = new Map<string, Employee>();

    (employees || []).forEach((member) => {
      if (!member || !member.id) return;
      if (member.role === 'manager') {
        uniqueManagers.set(member.id, member);
      }
    });

    if (currentUser.role === 'manager') {
      uniqueManagers.set(currentUser.id, currentUser);
    }

    return Array.from(uniqueManagers.values());
  }, [employees, currentUser]);
  const canSubmitCreateUser =
    !requiresManagerSelection || (managerOptions.length > 0 && selectedManagerIds.length > 0);

  // Always show the logged-in admin/super-admin in team list, even if DB sync lags.
  const teamMembers = useMemo(() => {
    const normalizedEmployees = (employees || []).filter(Boolean);
    const currentUserId = String(currentUser?.id || '').trim();

    if (!currentUserId) {
      return normalizedEmployees;
    }

    const alreadyIncluded = normalizedEmployees.some(
      (emp) => String(emp?.id || '').trim() === currentUserId
    );

    if (alreadyIncluded) {
      return normalizedEmployees;
    }

    const fallbackCurrentUser: Employee = {
      ...currentUser,
      id: currentUserId,
      email: String(currentUser.email || `${currentUserId}@taskpro.local`),
      mobile: String(currentUser.mobile || currentUserId.slice(0, 10)),
      points: Number(currentUser.points || 0),
      company_id: String(currentUser.company_id || '00000000-0000-0000-0000-000000000001'),
    };

    return [fallbackCurrentUser, ...normalizedEmployees];
  }, [employees, currentUser]);

  const managerNameById = useMemo(() => {
    const managerMap = new Map<string, string>();
    [...(employees || []), ...(teamMembers || [])].forEach((member) => {
      if (!member || !member.id || !member.name) return;
      if (member.role === 'manager' || member.role === 'super_admin' || member.role === 'owner') {
        managerMap.set(String(member.id), String(member.name));
      }
    });
    managerMap.set(String(currentUser.id), String(currentUser.name));
    return managerMap;
  }, [employees, teamMembers, currentUser.id, currentUser.name]);

  const managerIdsByStaffId = useMemo(() => {
    const managerMap = new Map<string, string[]>();
    (staffManagerLinks || []).forEach((link) => {
      if (!link) return;
      if (String(link.company_id || '').trim() !== String(currentUser.company_id || '').trim()) return;

      const staffId = String(link.staff_id || '').trim();
      const managerId = String(link.manager_id || '').trim();
      if (!staffId || !managerId) return;

      const existing = managerMap.get(staffId) || [];
      if (!existing.includes(managerId)) {
        managerMap.set(staffId, [...existing, managerId]);
      }
    });
    return managerMap;
  }, [staffManagerLinks, currentUser.company_id]);

  const getManagerIdsForMember = (member: Employee): string[] => {
    const linkManagerIds = managerIdsByStaffId.get(String(member.id || '').trim()) || [];
    if (linkManagerIds.length > 0) {
      return linkManagerIds;
    }

    const fallbackManagerId =
      typeof member.manager_id === 'string' && member.manager_id.trim()
        ? member.manager_id.trim()
        : '';
    return fallbackManagerId ? [fallbackManagerId] : [];
  };

  const getAddedByLabel = (member: Employee): string | null => {
    if (!member || member.role !== 'staff') {
      return null;
    }

    const managerIds = getManagerIdsForMember(member);
    if (!managerIds.length) {
      return 'Added by: Unassigned';
    }

    const managerNames = managerIds.map((managerId) => managerNameById.get(managerId) || managerId);
    return `Added by: ${managerNames.join(', ')}`;
  };

  const canDeleteMember = (member: Employee): boolean => {
    if (!member || member.id === currentUser.id) {
      return false;
    }

    if (currentUser.role === 'super_admin' || currentUser.role === 'owner') {
      return true;
    }

    if (currentUser.role === 'manager') {
      return member.role === 'staff' && getManagerIdsForMember(member).includes(currentUser.id);
    }

    return false;
  };

  const canManageMemberManagers = (member: Employee): boolean => {
    if (!member || member.role !== 'staff') return false;

    if (currentUser.role === 'super_admin' || currentUser.role === 'owner') {
      return true;
    }

    if (currentUser.role === 'manager') {
      return getManagerIdsForMember(member).includes(currentUser.id);
    }

    return false;
  };


  useEffect(() => {
    if (assignableRoles.length === 0) return;
    if (!assignableRoles.includes(newRole)) {
      setNewRole(assignableRoles[0]);
    }
  }, [assignableRoles, newRole]);

  useEffect(() => {
    if (newRole !== 'staff') {
      setSelectedManagerIds([]);
      return;
    }

    if (currentUser.role === 'manager') {
      setSelectedManagerIds([currentUser.id]);
      return;
    }

    if (currentUser.role === 'super_admin' || currentUser.role === 'owner') {
      setSelectedManagerIds((prev) => {
        const allowedIds = new Set(managerOptions.map((manager) => manager.id));
        const retained = prev.filter((managerId) => allowedIds.has(managerId));
        if (retained.length > 0) {
          return retained;
        }
        return managerOptions[0]?.id ? [managerOptions[0].id] : [];
      });
      return;
    }

    setSelectedManagerIds([]);
  }, [newRole, currentUser.role, currentUser.id, managerOptions]);

  const handleRefresh = () => {
    window.location.reload();
  };

  const handleTestConnection = async () => {
    try {
      console.log('🔍 Testing database connection...');
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('company_id', currentUser.company_id);
      
      if (error) {
        console.error('❌ Connection Test Failed:', error);
      } else {
        console.log('✅ Connection Test Success:', data);
      }
    } catch (err) {
      console.error('🚨 Unexpected Error:', err);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canAddMembers) {
      toast.error('You do not have permission to add team members.');
      return;
    }

    const roleToCreate: UserRole = assignableRoles.includes(newRole)
      ? newRole
      : (assignableRoles[0] || 'staff');
    const managerOwnerIds =
      roleToCreate === 'staff' && currentUser.role === 'manager'
        ? [currentUser.id]
        : roleToCreate === 'staff' && (currentUser.role === 'super_admin' || currentUser.role === 'owner')
        ? selectedManagerIds
        : [];
    const managerOwnerId = managerOwnerIds[0] || null;
    
    // 1. Validate Form
    if (!newName.trim() || !newEmail.trim() || !newPassword.trim() || !newMobile.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    // 2. Basic mobile validation
    if (newMobile.length < 10) {
      toast.error('Please enter a valid 10-digit mobile number');
      return;
    }

    if (requiresManagerSelection && managerOwnerIds.length === 0) {
      toast.error('Please select a manager for this staff member.');
      return;
    }

    try {
      setIsAdding(true);
      // 2. Call Server (RPC)
      let { data, error } = await supabase.rpc('create_user_by_admin', {
        email: newEmail.trim(),
        password: newPassword.trim(),
        name: newName.trim(),
        role: roleToCreate,
        mobile: newMobile.trim(),
        company_id: currentUser.company_id
      });

      if (error) {
        const message = String(error.message || '').toLowerCase();
        const isLegacySignature = message.includes('function') && message.includes('create_user_by_admin');

        // Backward compatibility if database still has old RPC signature without company_id.
        if (isLegacySignature) {
          const retry = await supabase.rpc('create_user_by_admin', {
            email: newEmail.trim(),
            password: newPassword.trim(),
            name: newName.trim(),
            role: roleToCreate,
            mobile: newMobile.trim()
          });
          data = retry.data;
          error = retry.error;
        }
      }

      if (error) {
        console.error('Error creating user:', error);
        if (error.message.includes('unique constraint') || error.code === '23505') {
          toast.error('This mobile number or email is already registered!');
        } else if (String(error.message || '').toLowerCase().includes('company_id')) {
          toast.error('Database setup needed: company_id mapping for employees is missing. Please run latest SQL migration.');
        } else {
          toast.error('Failed to create user: ' + error.message);
        }
        return; // STOP here. Do not proceed.
      }

      // 3. Success! Ensure this user is linked to the current company.
      const safeId =
        typeof data === 'string'
          ? data
          : String(
              data?.id ||
              data?.user_id ||
              data?.uid ||
              data?.employee_id ||
              data?.user?.id ||
              ''
            ).trim();

      const buildPayload = (employeeId: string) => ({
        id: employeeId,
        company_id: currentUser.company_id,
        name: newName.trim(),
        mobile: newMobile.trim(),
        role: roleToCreate,
        points: 0,
        updated_at: new Date().toISOString()
      });

      let canLookupByEmail = true;
      const upsertEmployeeProfile = async (employeeId: string) => {
        const basePayload = buildPayload(employeeId);
        let payload: Record<string, any> = {
          ...basePayload,
          email: newEmail.trim(),
          ...(managerOwnerId ? { manager_id: managerOwnerId } : {})
        };

        let lastError: any = null;
        const attemptedShapes = new Set<string>();

        while (true) {
          const payloadShapeKey = Object.keys(payload).sort().join(',');
          if (attemptedShapes.has(payloadShapeKey)) {
            break;
          }
          attemptedShapes.add(payloadShapeKey);

          const { error } = await supabase
            .from('employees')
            .upsert(payload, { onConflict: 'id' });

          if (!error) {
            return null;
          }

          lastError = error;
          if (isMissingSpecificColumnError(error, 'email')) {
            canLookupByEmail = false;
          }

          if (!isMissingColumnError(error)) {
            return error;
          }

          const nextPayload = removeMissingColumnFromPayload(payload, error);
          if (!nextPayload) {
            return error;
          }

          payload = nextPayload;
        }

        return lastError;
      };

      const findEmployeeIdentity = async (scopeToCompany: boolean) => {
        let query = supabase
          .from('employees')
          .select('*')
          .limit(1);

        if (scopeToCompany) {
          query = query.eq('company_id', currentUser.company_id);
        }

        if (canLookupByEmail) {
          const { data: byEmailRow, error: byEmailError } = await query
            .eq('email', newEmail.trim())
            .maybeSingle();

          if (isMissingSpecificColumnError(byEmailError, 'email')) {
            canLookupByEmail = false;
          }

          if (!byEmailError && byEmailRow) {
            return byEmailRow as Employee;
          }
        }

        const mobileQuery = supabase
          .from('employees')
          .select('*')
          .eq('mobile', newMobile.trim())
          .limit(1);

        const { data: byMobileRow, error: byMobileError } = scopeToCompany
          ? await mobileQuery.eq('company_id', currentUser.company_id).maybeSingle()
          : await mobileQuery.maybeSingle();

        if (!byMobileError && byMobileRow) {
          return byMobileRow as Employee;
        }

        return null;
      };

      let resolvedEmployeeId = safeId || '';
      let companyPatchError: any = null;

      if (resolvedEmployeeId) {
        companyPatchError = await upsertEmployeeProfile(resolvedEmployeeId);
      }

      // Fallback path: if RPC response id is empty/legacy, resolve row by identity and patch again.
      if (!resolvedEmployeeId || companyPatchError) {
        // 1) Try inside current company first.
        let matchedIdentity = await findEmployeeIdentity(true);
        // 2) If still not found, try globally and then force company upsert.
        if (!matchedIdentity) {
          matchedIdentity = await findEmployeeIdentity(false);
        }

        if (matchedIdentity) {
          resolvedEmployeeId = String((matchedIdentity as any).id || '').trim();
        }

        if (resolvedEmployeeId) {
          companyPatchError = await upsertEmployeeProfile(resolvedEmployeeId);
        }
      }

      if (!resolvedEmployeeId) {
        toast.error('User auth account was created, but employee profile sync failed. Please retry once.');
        return;
      }

      const fetchPersistedEmployee = async () => {
        const { data, error } = await supabase
          .from('employees')
          .select('*')
          .eq('id', resolvedEmployeeId)
          .eq('company_id', currentUser.company_id)
          .maybeSingle();
        return { data: data as Employee | null, error };
      };

      let { data: persistedEmployee, error: persistedEmployeeError } = await fetchPersistedEmployee();

      if (persistedEmployeeError && !isMissingColumnError(persistedEmployeeError)) {
        console.warn('Could not verify persisted employee row after create_user_by_admin:', persistedEmployeeError);
      }

      if (!persistedEmployee) {
        // Recovery path: legacy RPCs may create the profile row in a default/wrong tenant.
        // Repair by identity and force current company mapping.
        let repairPayload: Record<string, any> = {
          company_id: currentUser.company_id,
          name: newName.trim(),
          mobile: newMobile.trim(),
          role: roleToCreate,
          updated_at: new Date().toISOString(),
          ...(managerOwnerId ? { manager_id: managerOwnerId } : {}),
        };

        const attemptRepairUpdate = async () => {
          while (true) {
            const { error } = await supabase
              .from('employees')
              .update(repairPayload)
              .eq('id', resolvedEmployeeId);

            if (!error) {
              return null;
            }

            if (!isMissingColumnError(error)) {
              return error;
            }

            const nextPayload = removeMissingColumnFromPayload(repairPayload, error);
            if (!nextPayload) {
              return error;
            }
            repairPayload = nextPayload;
          }
        };

        const repairError = await attemptRepairUpdate();
        if (repairError) {
          console.warn('Profile repair by id failed, trying identity-based repair:', repairError);

          let identityRepairPayload = { ...repairPayload };
          while (true) {
            let identityRepairQuery = supabase
              .from('employees')
              .update(identityRepairPayload)
              .eq('mobile', newMobile.trim());

            if (canLookupByEmail) {
              identityRepairQuery = supabase
                .from('employees')
                .update(identityRepairPayload)
                .or(`mobile.eq.${newMobile.trim()},email.eq.${newEmail.trim()}`);
            }

            const { error } = await identityRepairQuery;
            if (!error) {
              break;
            }

            if (!isMissingColumnError(error)) {
              console.warn('Identity repair update failed:', error);
              break;
            }

            const nextPayload = removeMissingColumnFromPayload(identityRepairPayload, error);
            if (!nextPayload) {
              console.warn('Identity repair could not strip missing column from payload:', error);
              break;
            }
            identityRepairPayload = nextPayload;
          }
        }

        const retryFetch = await fetchPersistedEmployee();
        persistedEmployee = retryFetch.data;
        persistedEmployeeError = retryFetch.error;
        if (persistedEmployeeError && !isMissingColumnError(persistedEmployeeError)) {
          console.warn('Could not verify persisted employee row after repair attempt:', persistedEmployeeError);
        }
      }

      if (!persistedEmployee) {
        if (companyPatchError) {
          console.warn('Could not fully sync new employee profile row:', companyPatchError);
        }
        toast.error('User created, but profile row was not saved in this company. Please retry once.');
        return;
      }

      const localCreatedEmployee: Employee = {
        id: String((persistedEmployee as any).id || resolvedEmployeeId),
        name: String((persistedEmployee as any).name || newName.trim()),
        email: String((persistedEmployee as any).email || newEmail.trim() || `${newMobile.trim()}@taskpro.local`),
        mobile: String((persistedEmployee as any).mobile || newMobile.trim()),
        role: ((persistedEmployee as any).role || roleToCreate) as UserRole,
        points: Number((persistedEmployee as any).points || 0),
        company_id: String((persistedEmployee as any).company_id || currentUser.company_id || '00000000-0000-0000-0000-000000000001'),
        manager_id:
          typeof (persistedEmployee as any).manager_id === 'string' && (persistedEmployee as any).manager_id.trim()
            ? (persistedEmployee as any).manager_id.trim()
            : managerOwnerId,
      };

      if (roleToCreate === 'staff') {
        const linkSyncOk = await onUpdateStaffManagers(localCreatedEmployee.id, managerOwnerIds);
        if (!linkSyncOk) {
          toast.warning('User created, but manager links could not be fully synced. Run latest SQL migration.');
        }
      }

      // 4. Refresh team list for this company; fallback to local append if refresh fails.
      if (setEmployees && currentUser.company_id) {
        const { data: refreshedEmployees, error: refreshError } = await supabase
          .from('employees')
          .select('*')
          .eq('company_id', currentUser.company_id);

        if (!refreshError && refreshedEmployees) {
          const employeeRows = refreshedEmployees as Employee[];
          const hasCreatedEmployee = employeeRows.some((emp) => {
            const sameId = String(emp?.id || '').trim() === String(localCreatedEmployee.id).trim();
            const sameEmail =
              String(emp?.email || '').trim().toLowerCase() ===
              String(localCreatedEmployee.email || '').trim().toLowerCase();
            const sameMobile =
              String(emp?.mobile || '').trim() === String(localCreatedEmployee.mobile || '').trim();
            return sameId || sameEmail || sameMobile;
          });
          setEmployees(hasCreatedEmployee ? employeeRows : [localCreatedEmployee, ...employeeRows]);
        } else {
          console.warn('Failed to refresh employees after create_user_by_admin:', refreshError);
          setEmployees((teamMembers as Employee[]).some((emp) => emp.id === localCreatedEmployee.id)
            ? teamMembers as Employee[]
            : [localCreatedEmployee, ...(teamMembers as Employee[])]);
        }
      } else {
        onAddEmployee(newName.trim(), newMobile.trim(), roleToCreate, managerOwnerId);
      }

      // 5. Cleanup
      toast.success('User created successfully!');
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setNewMobile('');
      setNewRole('staff');
      setSelectedManagerIds(currentUser.role === 'manager' ? [currentUser.id] : []);
      setIsAdding(false);
    } catch (err: any) {
      console.error('Unexpected crash:', err);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsAdding(false);
    }
  };

  const openManagerEditor = (member: Employee) => {
    setEditingStaffId(member.id);
    setEditingManagerIds(getManagerIdsForMember(member));
  };

  const closeManagerEditor = () => {
    setEditingStaffId(null);
    setEditingManagerIds([]);
  };

  const handleSaveManagerLinks = async (staffId: string) => {
    setIsSavingManagers(true);
    try {
      const success = await onUpdateStaffManagers(staffId, editingManagerIds);
      if (success) {
        toast.success('Manager links updated.');
        closeManagerEditor();
      } else {
        toast.error('Could not update manager links.');
      }
    } finally {
      setIsSavingManagers(false);
    }
  };

  const handleRewardConfigUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    const target = parseInt(targetPoints);
    if (target > 0 && rewardName.trim()) {
      onUpdateRewardConfig({
        targetPoints: target,
        rewardName: rewardName.trim()
      });
    }
  };

  // Sort employees by points for leaderboard
  const sortedEmployees = [...teamMembers].sort((a, b) => b.points - a.points);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="w-5 h-5 text-indigo-700" />
          <h2 className="text-xl font-bold italic text-slate-900">Team</h2>
        </div>
        <p className="text-slate-500 text-sm">
          Manage staff members and assign their access permissions.
        </p>
      </div>

      {canAddMembers && (
        <section className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">Add Staff Member</h3>
          <form onSubmit={handleCreateUser} className="space-y-3">
            <input 
              type="text" 
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Full Name..."
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-800 transition-all"
              required
            />
            <input 
              type="email" 
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Email Address..."
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-800 transition-all"
              required
            />
            <input 
              type="password" 
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Password..."
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-800 transition-all"
              required
            />
            <div className="relative">
              <input 
                type="tel" 
                value={newMobile}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                  setNewMobile(val);
                }}
                placeholder="Mobile Number"
                className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-800 transition-all"
                required
              />
              <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            </div>
            <div className="flex gap-2">
              <select 
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as UserRole)}
                className="flex-1 bg-white border border-slate-200 rounded-xl px-4 h-10 text-sm text-slate-900 outline-none"
              >
                {assignableRoles.map((roleOption) => (
                  <option key={roleOption} value={roleOption} className="text-slate-900">
                    {getRoleLabel(roleOption)}
                  </option>
                ))}
              </select>
              <button 
                type="submit"
                disabled={isAdding || !canSubmitCreateUser}
                className="bg-indigo-900 hover:bg-indigo-800 text-white p-3 px-6 h-10 rounded-xl active:scale-95 transition-all duration-200 flex items-center gap-2 font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <UserPlus className="w-5 h-5" />
                {isAdding ? 'Creating...' : 'Create User'}
              </button>
            </div>
            {canAssignMultipleManagers && (
              <div className="space-y-2">
                <div className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 space-y-2">
                  <p className="text-[11px] font-semibold text-slate-600">Assign Managers</p>
                  {managerOptions.map((manager) => (
                    <label key={manager.id} className="flex items-center gap-2 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        checked={selectedManagerIds.includes(manager.id)}
                        onChange={(e) => {
                          setSelectedManagerIds((prev) => {
                            if (e.target.checked) {
                              return prev.includes(manager.id) ? prev : [...prev, manager.id];
                            }
                            return prev.filter((managerId) => managerId !== manager.id);
                          });
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-900 focus:ring-slate-800"
                      />
                      <span>{manager.name}</span>
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500">
                  This staff member will be visible under all selected managers.
                </p>
                {newRole !== 'staff' && (
                  <p className="text-[11px] text-slate-500">
                    Manager selection applies when role is set to Staff.
                  </p>
                )}
                {managerOptions.length === 0 && (
                  <p className="mt-1 text-[11px] text-rose-600">
                    Create at least one manager first.
                  </p>
                )}
                {requiresManagerSelection && managerOptions.length > 0 && selectedManagerIds.length === 0 && (
                  <p className="mt-1 text-[11px] text-rose-600">
                    Select at least one manager.
                  </p>
                )}
              </div>
            )}
          </form>
        </section>
      )}

      {/* Reward Settings - Hidden */}
      {SHOW_POINTS_SYSTEM && (
      <section className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
        <h3 className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider flex items-center gap-2">
          <Trophy className="w-4 h-4 text-yellow-500" />
          Reward Settings
        </h3>
        <form onSubmit={handleRewardConfigUpdate} className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-slate-600 font-medium mb-1 block">Target Points</label>
              <input 
                type="number" 
                value={targetPoints}
                onChange={(e) => setTargetPoints(e.target.value)}
                min="1"
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-800 transition-all"
                required
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-slate-600 font-medium mb-1 block">Reward Name</label>
              <input 
                type="text" 
                value={rewardName}
                onChange={(e) => setRewardName(e.target.value)}
                placeholder="e.g., Bonus Day Off"
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-800 transition-all"
                required
              />
            </div>
          </div>
          <button 
            type="submit"
            className="w-full bg-indigo-900 text-white py-3 rounded-xl active:scale-95 transition-transform flex items-center justify-center gap-2 shadow-sm shadow-[0_2px_8px_rgba(0,0,0,0.04)] font-bold"
          >
            <Target className="w-5 h-5" />
            Update Reward
          </button>
        </form>
      </section>
      )}

      {/* Leaderboard - Hidden */}
      {SHOW_POINTS_SYSTEM && (
      <section className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
        <h3 className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider flex items-center gap-2">
          <Medal className="w-4 h-4 text-amber-500" />
          Points Leaderboard
        </h3>
        {employees.length > 0 ? (
          <div className="space-y-2">
            {sortedEmployees.map((emp, index) => {
              // Strict safety filter: prevent all invalid data from rendering
              if (!emp || !emp.id || !emp.name || emp.name.trim() === '') return null;
              
              return (
              <div 
                key={emp.id} 
                className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-sm hover:scale-[1.02] transition-all duration-200"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                    index === 0 ? 'bg-yellow-400 text-yellow-900' :
                    index === 1 ? 'bg-gray-300 text-gray-700' :
                    index === 2 ? 'bg-amber-600 text-amber-100' :
                    'bg-slate-200 text-slate-600'
                  }`}>
                    {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-700">{emp.name}</p>
                    <p className="text-xs text-slate-500">{getRoleLabel(emp.role)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg text-indigo-700">{emp.points}</p>
                  <p className="text-xs text-slate-500">points</p>
                </div>
              </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 bg-slate-100/50 rounded-xl border border-dashed border-slate-200">
            <RefreshCw className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-sm text-slate-500 mb-4">No team members yet.</p>
            <button 
              onClick={handleRefresh}
              className="bg-indigo-900 text-white px-6 py-3 rounded-xl font-semibold hover:bg-indigo-800 active:scale-95 transition-all flex items-center gap-2 mx-auto mb-4"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh List
            </button>
            <button 
              onClick={handleTestConnection}
              className="bg-slate-800 text-white px-6 py-3 rounded-xl font-semibold hover:bg-slate-700 active:scale-95 transition-all flex items-center gap-2 mx-auto"
            >
              <Wifi className="w-4 h-4" />
              Test Connection
            </button>
          </div>
        )}
      </section>
      )}

      <div className="space-y-2">
        
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">Registered Team ({teamMembers.length})</h3>
        {teamMembers.length > 0 ? (
          teamMembers.map((emp) => {
            // Strict safety filter: prevent all invalid data from rendering
            if (!emp || !emp.id || !emp.name || emp.name.trim() === '') return null;
            const addedByLabel = getAddedByLabel(emp);
            const showAddedBy =
              Boolean(addedByLabel) &&
              (currentUser.role === 'super_admin' || currentUser.role === 'owner');
            
            return (
            <React.Fragment key={emp.id}>
            <div 
              className="bg-white p-4 rounded-2xl border border-slate-200 flex items-start justify-between gap-3 group transition-all hover:bg-slate-50"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${emp.role === 'manager' || emp.role === 'super_admin' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                  {emp.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{emp.name}</p>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${emp.role === 'super_admin' || emp.role === 'owner' ? 'bg-slate-800 text-white' : emp.role === 'manager' ? 'bg-indigo-900 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {getRoleLabel(emp.role)}
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">{emp.mobile}</span>
                      {SHOW_POINTS_SYSTEM && (
                      <span className="text-[9px] font-black text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                        {emp.points} pts
                      </span>
                      )}
                    </div>
                    {showAddedBy && (
                      <p className="text-[10px] text-slate-500 font-medium">{addedByLabel}</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <span className="text-[10px] font-semibold text-indigo-700">ACTIVE</span>
              {canManageMemberManagers(emp) && (
                <button
                  type="button"
                  onClick={() => openManagerEditor(emp)}
                  className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg transition-all"
                >
                  Managers
                </button>
              )}
              {canDeleteMember(emp) && (
                <button 
                  type="button"
                  onClick={(e) => {
                    console.log('🗑️ Delete button clicked for:', emp.name, emp.id);
                    e.preventDefault();
                    e.stopPropagation();
                    
                    if (window.confirm(`Are you sure you want to delete ${emp.name}? This action cannot be undone.`)) {
                      console.log('✅ Delete confirmed, calling parent function');
                      
                      // Call parent function for database deletion
                      console.log('📞 Calling onRemoveEmployee with ID:', emp.id);
                      onRemoveEmployee(emp.id);
                    } else {
                      console.log('❌ Delete cancelled');
                    }
                  }}
                  className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-full cursor-pointer transition-all"
                  title="Delete employee"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
              </div>
            </div>
            {editingStaffId === emp.id && canManageMemberManagers(emp) && (
              <div className="bg-white border border-slate-200 rounded-2xl p-3 space-y-3">
                <p className="text-[11px] font-semibold text-slate-600">Edit managers for {emp.name}</p>
                <div className="space-y-2">
                  {managerOptions.map((manager) => (
                    <label key={`${emp.id}-${manager.id}`} className="flex items-center gap-2 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        checked={editingManagerIds.includes(manager.id)}
                        onChange={(e) => {
                          setEditingManagerIds((prev) => {
                            if (e.target.checked) {
                              return prev.includes(manager.id) ? prev : [...prev, manager.id];
                            }
                            return prev.filter((managerId) => managerId !== manager.id);
                          });
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-900 focus:ring-slate-800"
                      />
                      <span>{manager.name}</span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={closeManagerEditor}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold py-2 rounded-xl transition-all"
                    disabled={isSavingManagers}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveManagerLinks(emp.id)}
                    className="flex-1 bg-indigo-900 hover:bg-indigo-800 text-white text-sm font-semibold py-2 rounded-xl transition-all disabled:opacity-60"
                    disabled={isSavingManagers}
                  >
                    {isSavingManagers ? 'Saving...' : 'Save Managers'}
                  </button>
                </div>
              </div>
            )}
            </React.Fragment>
            );
          })
        ) : (
          <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-slate-200">
            <User className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p className="text-sm text-slate-500">No staff members registered yet.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeamManager;

