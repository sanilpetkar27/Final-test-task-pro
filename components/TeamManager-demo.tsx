import React, { useState } from 'react';
import { Employee, UserRole, RewardConfig } from '../types';
import { UserPlus, UserMinus, User, ShieldCheck, Phone, Trophy, Target, Star, Medal, RefreshCw, Wifi } from 'lucide-react';

interface TeamManagerProps {
  employees: Employee[];
  onAddEmployee: (name: string, mobile: string, role: UserRole) => void;
  onRemoveEmployee: (id: string) => void;
  rewardConfig: RewardConfig;
  onUpdateRewardConfig: (config: RewardConfig) => void;
}

const TeamManager: React.FC<TeamManagerProps> = ({ 
  employees, 
  onAddEmployee, 
  onRemoveEmployee, 
  rewardConfig, 
  onUpdateRewardConfig 
}) => {
  const [newEmployeeName, setNewEmployeeName] = useState('');
  const [newEmployeeMobile, setNewEmployeeMobile] = useState('');
  const [newEmployeeRole, setNewEmployeeRole] = useState<UserRole>('staff');
  const [showAddForm, setShowAddForm] = useState(false);

  const managerEmployees = employees.filter(emp => emp.role === 'manager');
  const staffEmployees = employees.filter(emp => emp.role === 'staff');
  const totalPoints = staffEmployees.reduce((sum, emp) => sum + emp.points, 0);

  const handleAddEmployee = () => {
    if (!newEmployeeName.trim() || !newEmployeeMobile.trim()) return;
    
    onAddEmployee(newEmployeeName.trim(), newEmployeeMobile.trim(), newEmployeeRole);
    setNewEmployeeName('');
    setNewEmployeeMobile('');
    setNewEmployeeRole('staff');
    setShowAddForm(false);
  };

  const topPerformer = staffEmployees.reduce((prev, current) => 
    (prev.points > current.points) ? prev : current, staffEmployees[0]
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-800">Team Management</h2>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Wifi className="w-4 h-4 text-green-500" />
            <span>Demo Mode</span>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-blue-50 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-blue-600">{employees.length}</div>
            <div className="text-xs text-blue-700 font-medium">Total Team</div>
          </div>
          <div className="bg-green-50 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-green-600">{staffEmployees.length}</div>
            <div className="text-xs text-green-700 font-medium">Staff Members</div>
          </div>
          <div className="bg-purple-50 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-purple-600">{totalPoints}</div>
            <div className="text-xs text-purple-700 font-medium">Total Points</div>
          </div>
        </div>

        {/* Add Employee Button */}
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
        >
          <UserPlus className="w-5 h-5" />
          Add Team Member
        </button>

        {/* Add Employee Form */}
        {showAddForm && (
          <div className="bg-slate-50 rounded-xl p-4 space-y-3 mt-4">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              <UserPlus className="w-4 h-4" />
              New Team Member
            </h3>
            
            <input
              type="text"
              placeholder="Full name"
              value={newEmployeeName}
              onChange={(e) => setNewEmployeeName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            
            <input
              type="tel"
              placeholder="Mobile number"
              value={newEmployeeMobile}
              onChange={(e) => setNewEmployeeMobile(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            
            <select
              value={newEmployeeRole}
              onChange={(e) => setNewEmployeeRole(e.target.value as UserRole)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="staff">Staff Member</option>
              <option value="manager">Manager</option>
            </select>
            
            <div className="flex gap-2">
              <button
                onClick={handleAddEmployee}
                disabled={!newEmployeeName.trim() || !newEmployeeMobile.trim()}
                className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Add Member
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewEmployeeName('');
                  setNewEmployeeMobile('');
                  setNewEmployeeRole('staff');
                }}
                className="flex-1 bg-slate-200 text-slate-700 py-3 rounded-xl font-semibold hover:bg-slate-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Managers Section */}
      {managerEmployees.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
          <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            Managers ({managerEmployees.length})
          </h3>
          <div className="space-y-2">
            {managerEmployees.map(manager => (
              <div key={manager.id} className="bg-blue-50 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                    {manager.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800">{manager.name}</div>
                    <div className="text-sm text-slate-600 flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {manager.mobile}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-blue-600 font-medium uppercase tracking-wider">Manager</div>
                  <div className="text-sm font-bold text-blue-700">{manager.points} pts</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Staff Section */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
        <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
          <User className="w-4 h-4 text-green-600" />
          Staff Members ({staffEmployees.length})
        </h3>
        
        {staffEmployees.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <User className="w-12 h-12 mx-auto mb-2" />
            <p>No staff members yet</p>
            <p className="text-sm">Add your first team member to get started</p>
          </div>
        ) : (
          <div className="space-y-2">
            {staffEmployees.map(staff => (
              <div key={staff.id} className="bg-slate-50 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center text-white font-bold">
                    {staff.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800">{staff.name}</div>
                    <div className="text-sm text-slate-600 flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {staff.mobile}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm font-bold text-green-700">{staff.points} pts</div>
                    {staff.points >= rewardConfig.targetPoints && (
                      <div className="text-xs text-amber-600 font-medium">🏆 Goal Reached!</div>
                    )}
                  </div>
                  <button
                    onClick={() => onRemoveEmployee(staff.id)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Remove team member"
                  >
                    <UserMinus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top Performer */}
      {topPerformer && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-4 shadow-sm border border-amber-200">
          <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-600" />
            Top Performer
          </h3>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-amber-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                {topPerformer.name.charAt(0)}
              </div>
              <div>
                <div className="font-bold text-slate-800">{topPerformer.name}</div>
                <div className="text-sm text-slate-600">{topPerformer.points} points earned</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl">🏆</div>
              <div className="text-xs text-amber-700 font-medium">Leading</div>
            </div>
          </div>
        </div>
      )}

      {/* Reward Configuration */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
        <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
          <Target className="w-4 h-4 text-purple-600" />
          Reward Configuration
        </h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Points Target
            </label>
            <input
              type="number"
              value={rewardConfig.targetPoints}
              onChange={(e) => onUpdateRewardConfig({
                ...rewardConfig,
                targetPoints: parseInt(e.target.value) || 0
              })}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Reward Name
            </label>
            <input
              type="text"
              value={rewardConfig.rewardName}
              onChange={(e) => onUpdateRewardConfig({
                ...rewardConfig,
                rewardName: e.target.value
              })}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeamManager;
