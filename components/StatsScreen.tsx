import React from 'react';
import { DealershipTask, Employee, RewardConfig } from '../types';
import { LayoutDashboard, Clock, Timer, CheckCircle2, Trophy, Target, Star } from 'lucide-react';

interface StatsScreenProps {
  tasks: DealershipTask[];
  currentUser: Employee;
  employees: Employee[];
  rewardConfig: RewardConfig;
}

const StatsScreen: React.FC<StatsScreenProps> = ({ tasks, currentUser, employees, rewardConfig }) => {
  // Feature flag - set to true to show points system
  const SHOW_POINTS_SYSTEM = false;
  
  const totalTasks = tasks.length;
  const pendingTasks = tasks.filter(t => t.status === 'pending').length;
  const inProgressTasks = tasks.filter(t => t.status === 'in-progress').length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;

  const isManager = currentUser.role === 'manager' || currentUser.role === 'super_admin';
  const userPoints = currentUser.points;
  const progressPercentage = Math.min((userPoints / rewardConfig.targetPoints) * 100, 100);
  const pointsToReward = Math.max(rewardConfig.targetPoints - userPoints, 0);

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

      {/* My Rewards - All Users - Hidden */}
      {SHOW_POINTS_SYSTEM && (
      <div className="bg-gradient-to-br from-indigo-900 to-slate-800 p-6 rounded-2xl text-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-5 h-5 text-yellow-300" />
          <h3 className="text-lg font-bold italic">My Rewards</h3>
        </div>
        
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-indigo-200 text-sm">Current Points</span>
            <span className="text-2xl font-bold">{userPoints}</span>
          </div>
          
          <div className="flex items-center justify-between mb-3">
            <span className="text-indigo-200 text-sm">Target</span>
            <span className="text-lg font-semibold">{rewardConfig.targetPoints} pts</span>
          </div>
          
          {/* Progress Bar */}
          <div className="w-full bg-indigo-950/40 rounded-full h-3 mb-2">
            <div 
              className="bg-gradient-to-r from-yellow-400 to-yellow-300 h-3 rounded-full transition-all duration-500"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          
          <div className="flex items-center justify-between text-sm">
            <span className="text-indigo-200">
              {pointsToReward > 0 ? `${pointsToReward} points to reward` : 'Target reached!'}
            </span>
            <span className="text-yellow-300 font-medium">
              {rewardConfig.rewardName}
            </span>
          </div>
        </div>
        
        {/* Reward Icon */}
        <div className="flex items-center justify-center">
          <div className="w-16 h-16 bg-yellow-400 rounded-full flex items-center justify-center shadow-sm">
            <Star className="w-8 h-8 text-indigo-900" />
          </div>
        </div>
      </div>
      )}
    </div>
  );
};

export default StatsScreen;
