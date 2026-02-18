
import React, { useState } from 'react';
import { Employee } from '../types';
import { ArrowRight, X, UserCheck, AlertCircle } from 'lucide-react';

interface ReassignModalProps {
  employees: Employee[];
  currentAssignee?: string;
  onClose: () => void;
  onConfirm: (newAssigneeId: string) => void;
}

const ReassignModal: React.FC<ReassignModalProps> = ({ employees, currentAssignee, onClose, onConfirm }) => {
  const [targetId, setTargetId] = useState('none');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (targetId === 'none') return;
    onConfirm(targetId);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#111b21]/80 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom duration-300">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <div className="bg-[#d9fdd3] p-2 rounded-xl text-[#008069]">
              <ArrowRight className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-[#202c33]">Delegate Task</h2>
          </div>
          <button onClick={onClose} className="p-2 bg-[#f0f2f5] rounded-full text-[#54656f]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-[#f0f2f5] p-4 rounded-2xl border border-[#d1d7db] flex gap-3">
             <AlertCircle className="w-5 h-5 text-[#008069] shrink-0 mt-0.5" />
             <p className="text-xs text-[#202c33] font-medium">
               You are reassigning this entire task. The selected person will become the new owner responsible for completion.
             </p>
          </div>

          <div>
            <label className="text-[10px] font-black text-[#54656f] uppercase tracking-widest ml-1 mb-2 block">Delegate to Person</label>
            <div className="relative">
              <select 
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full bg-white border border-[#d1d7db] rounded-xl px-4 py-4 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#00a884] appearance-none transition-all pr-12"
                autoFocus
              >
                <option value="none">Select Team Member...</option>
                {employees
                  .filter(emp => emp.id !== currentAssignee)
                  .map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.role === 'manager' ? 'Manager' : 'Staff'})
                    </option>
                  ))}
              </select>
              <UserCheck className="w-5 h-5 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 py-4 rounded-xl font-bold text-[#54656f] bg-[#f0f2f5] active:scale-95 transition-all"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={targetId === 'none'}
              className="flex-[2] py-4 rounded-xl font-bold text-white bg-[#00a884] active:scale-95 transition-all shadow-lg shadow-[#00a884]/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Delegate Now
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ReassignModal;
