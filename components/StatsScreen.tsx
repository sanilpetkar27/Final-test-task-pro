import React from 'react';
import { DealershipTask, Employee } from '../types';
import { LayoutDashboard, Clock, Timer, CheckCircle2 } from 'lucide-react';

interface StatsScreenProps {
  tasks: DealershipTask[];
  currentUser: Employee;
  employees: Employee[];
}

const StatsScreen: React.FC<StatsScreenProps> = ({ tasks, currentUser, employees }) => {
  const totalTasks = tasks.length;
  const pendingTasks = tasks.filter(t => t.status === 'pending').length;
  const inProgressTasks = tasks.filter(t => t.status === 'in-progress').length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;

  const isManager = currentUser.role === 'manager' || currentUser.role === 'super_admin';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-800 to-indigo-900 p-6 rounded-2xl text-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-2 mb-2">
          <LayoutDashboard className="w-5 h-5 text-indigo-200" />
          <h2 className="text-xl font-bold italic">Dashboard</h2>
        </div>
        <p className="text-slate-400 text-sm">
          {isManager ? 'Business overview and team performance.' : 'Track your progress and rewards.'}
        </p>
      </div>

      {/* Business Stats - Manager Only */}
      {isManager && (
        <div className="grid grid-cols-2 gap-4">
          {/* Total Tasks */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center">
                <LayoutDashboard className="w-6 h-6 text-slate-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-800">{totalTasks}</p>
            <p className="text-sm font-medium text-slate-500 mt-1">Total Tasks</p>
          </div>

          {/* Pending */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                <Clock className="w-6 h-6 text-amber-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-amber-600">{pendingTasks}</p>
            <p className="text-sm font-medium text-slate-500 mt-1">Pending</p>
          </div>

          {/* In Progress */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center">
                <Timer className="w-6 h-6 text-indigo-700" />
              </div>
            </div>
            <p className="text-2xl font-bold text-indigo-700">{inProgressTasks}</p>
            <p className="text-sm font-medium text-slate-500 mt-1">In Progress</p>
          </div>

          {/* Completed */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-700" />
              </div>
            </div>
            <p className="text-2xl font-bold text-emerald-700">{completedTasks}</p>
            <p className="text-sm font-medium text-slate-500 mt-1">Completed</p>
          </div>
        </div>
      )}

    </div>
  );
};

export default StatsScreen;
