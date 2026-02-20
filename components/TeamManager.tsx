
import React, { useState, useEffect, useMemo } from 'react';
import { Employee, UserRole, RewardConfig } from '../types';
import { UserPlus, Trash2, User, ShieldCheck, Phone, Trophy, Target, Star, Medal, RefreshCw, Wifi } from 'lucide-react';
import { supabase } from '../src/lib/supabase';
import { toast } from 'sonner';

interface TeamManagerProps {
  employees: Employee[];
  currentUser: Employee;
  onAddEmployee: (name: string, mobile: string, role: UserRole, managerId?: string | null) => void;
  onRemoveEmployee: (id: string) => void;
  rewardConfig: RewardConfig;
  onUpdateRewardConfig: (config: RewardConfig) => void;
  isSuperAdmin: boolean;
  setEmployees?: (employees: Employee[]) => void;
}

const isMissingColumnError = (error: any): boolean => {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('column') && message.includes('does not exist');
};

const isMissingSpecificColumnError = (error: any, columnName: string): boolean => {
  const message = String(error?.message || '').toLowerCase();
  return message.includes(columnName.toLowerCase()) && isMissingColumnError(error);
};

const TeamManager: React.FC<TeamManagerProps> = ({ 
  employees, 
  currentUser, 
  onAddEmployee, 
  onRemoveEmployee, 
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
  const [selectedManagerId, setSelectedManagerId] = useState('');
  const [targetPoints, setTargetPoints] = useState(rewardConfig.targetPoints.toString());
  const [rewardName, setRewardName] = useState(rewardConfig.rewardName);
  const [isAdding, setIsAdding] = useState(false);
  const canAddMembers = ['super_admin', 'manager', 'owner'].includes(currentUser.role);
  const requiresManagerSelection =
    (currentUser.role === 'super_admin' || currentUser.role === 'owner') && newRole === 'staff';

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
  const canSubmitCreateUser = !requiresManagerSelection || managerOptions.length > 0;

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

  const getAddedByLabel = (member: Employee): string | null => {
    if (!member || member.role !== 'staff') {
      return null;
    }

    const managerId =
      typeof member.manager_id === 'string' && member.manager_id.trim()
        ? member.manager_id.trim()
        : null;

    if (!managerId) {
      return 'Added by: Unassigned';
    }

    const managerName = managerNameById.get(managerId);
    return `Added by: ${managerName || managerId}`;
  };

  const canDeleteMember = (member: Employee): boolean => {
    if (!member || member.id === currentUser.id) {
      return false;
    }

    if (currentUser.role === 'super_admin' || currentUser.role === 'owner') {
      return true;
    }

    if (currentUser.role === 'manager') {
      const memberManagerId =
        typeof member.manager_id === 'string' && member.manager_id.trim()
          ? member.manager_id
          : null;
      return member.role === 'staff' && memberManagerId === currentUser.id;
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
      setSelectedManagerId('');
      return;
    }

    if (currentUser.role === 'manager') {
      setSelectedManagerId(currentUser.id);
      return;
    }

    if (currentUser.role === 'super_admin' || currentUser.role === 'owner') {
      setSelectedManagerId((prev) => {
        if (prev && managerOptions.some((manager) => manager.id === prev)) {
          return prev;
        }
        return managerOptions[0]?.id || '';
      });
      return;
    }

    setSelectedManagerId('');
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
    const managerOwnerId =
      roleToCreate === 'staff' && currentUser.role === 'manager'
        ? currentUser.id
        : roleToCreate === 'staff' && (currentUser.role === 'super_admin' || currentUser.role === 'owner')
        ? (selectedManagerId || null)
        : null;
    
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

    if (requiresManagerSelection && !managerOwnerId) {
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

      const upsertEmployeeProfile = async (employeeId: string) => {
        const basePayload = buildPayload(employeeId);
        const payloadWithEmailAndManager = {
          ...basePayload,
          email: newEmail.trim(),
          manager_id: managerOwnerId
        };

        let { error: companyPatchError } = await supabase
          .from('employees')
          .upsert(payloadWithEmailAndManager, { onConflict: 'id' });

        if (companyPatchError && isMissingSpecificColumnError(companyPatchError, 'manager_id')) {
          const retryWithoutManagerId = await supabase
            .from('employees')
            .upsert({
              ...basePayload,
              email: newEmail.trim()
            }, { onConflict: 'id' });
          companyPatchError = retryWithoutManagerId.error;
        }

        if (companyPatchError && isMissingColumnError(companyPatchError)) {
          const retryWithoutEmail = await supabase
            .from('employees')
            .upsert(basePayload, { onConflict: 'id' });
          companyPatchError = retryWithoutEmail.error;
        }

        return companyPatchError;
      };

      let resolvedEmployeeId = safeId || '';
      let companyPatchError: any = null;

      if (resolvedEmployeeId) {
        companyPatchError = await upsertEmployeeProfile(resolvedEmployeeId);
      }

      // Fallback path: if RPC response id is empty/legacy, resolve row by email/mobile and patch again.
      if (!resolvedEmployeeId || companyPatchError) {
        const { data: byEmailRows, error: byEmailError } = await supabase
          .from('employees')
          .select('id')
          .eq('company_id', currentUser.company_id)
          .eq('email', newEmail.trim())
          .limit(1);

        if (!byEmailError && byEmailRows && byEmailRows.length > 0) {
          resolvedEmployeeId = String((byEmailRows[0] as any).id || '').trim();
        }

        if (!resolvedEmployeeId) {
          const { data: byMobileRows, error: byMobileError } = await supabase
            .from('employees')
            .select('id')
            .eq('company_id', currentUser.company_id)
            .eq('mobile', newMobile.trim())
            .limit(1);

          if (!byMobileError && byMobileRows && byMobileRows.length > 0) {
            resolvedEmployeeId = String((byMobileRows[0] as any).id || '').trim();
          }
        }

        if (resolvedEmployeeId) {
          companyPatchError = await upsertEmployeeProfile(resolvedEmployeeId);
        }
      }

      if (companyPatchError) {
        console.warn('Could not fully sync new employee profile row:', companyPatchError);
      }

      const localCreatedEmployee: Employee = {
        id: resolvedEmployeeId || safeId || `emp-${Date.now()}`,
        name: newName.trim(),
        email: newEmail.trim() || `${newMobile.trim()}@taskpro.local`,
        mobile: newMobile.trim(),
        role: roleToCreate,
        points: 0,
        company_id: currentUser.company_id || '00000000-0000-0000-0000-000000000001',
        manager_id: managerOwnerId,
      };

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
      setSelectedManagerId(currentUser.role === 'manager' ? currentUser.id : '');
      setIsAdding(false);
    } catch (err: any) {
      console.error('Unexpected crash:', err);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsAdding(false);
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
                    {roleOption === 'super_admin'
                      ? 'Super Admin'
                      : roleOption.charAt(0).toUpperCase() + roleOption.slice(1)}
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
            {requiresManagerSelection && (
              <div className="relative">
                <select
                  value={selectedManagerId}
                  onChange={(e) => setSelectedManagerId(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-800 transition-all"
                  required
                >
                  <option value="">Select Manager</option>
                  {managerOptions.map((manager) => (
                    <option key={manager.id} value={manager.id}>
                      {manager.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  This staff member will be assigned to the selected manager's team.
                </p>
                {managerOptions.length === 0 && (
                  <p className="mt-1 text-[11px] text-rose-600">
                    Create at least one manager first.
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
                    <p className="text-xs text-slate-500">{emp.role}</p>
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
            <div 
              key={emp.id} 
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
                        {emp.role}
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

