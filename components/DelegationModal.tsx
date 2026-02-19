
import React, { useState } from 'react';
import { Employee } from '../types';
import { GitFork, X, UserCheck, AlertCircle } from 'lucide-react';

interface DelegationModalProps {
  employees: Employee[];
  onClose: () => void;
  onConfirm: (description: string, targetAssigneeId: string, deadline?: number) => void;
}

const DelegationModal: React.FC<DelegationModalProps> = ({ employees, onClose, onConfirm }) => {
  const [desc, setDesc] = useState('');
  const [targetId, setTargetId] = useState('none');
  const [deadline, setDeadline] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc.trim() || targetId === 'none') return;
    
    const deadlineTimestamp = deadline ? new Date(deadline).getTime() : undefined;
    onConfirm(desc.trim(), targetId, deadlineTimestamp);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] animate-in slide-in-from-bottom duration-300">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-50 p-2 rounded-xl text-indigo-700">
              <GitFork className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Allot Further</h2>
          </div>
          <button onClick={onClose} className="p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex gap-3">
             <AlertCircle className="w-5 h-5 text-indigo-700 shrink-0 mt-0.5" />
             <p className="text-xs text-slate-900 font-medium">
               You are delegating this operation. You will still see it in your list, but someone else will be responsible for finishing it.
             </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Sub-Task Details</label>
              <input 
                type="text" 
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="What specifically should they do?"
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-4 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-800 transition-all placeholder:text-slate-400"
                autoFocus
              />
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Allot to Person</label>
                <div className="relative">
                  <select 
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-4 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-800 appearance-none transition-all pr-12"
                  >
                    <option value="none">Select Team Member...</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.role === 'manager' ? 'Manager' : 'Staff'})
                      </option>
                    ))}
                  </select>
                  <UserCheck className="w-5 h-5 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
              
              <div className="w-1/3">
                 <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Due By (Optional)</label>
                 <input 
                    type="datetime-local" 
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-2 py-4 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-800 transition-all"
                  />
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 py-4 rounded-xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={!desc.trim() || targetId === 'none'}
              className="flex-[2] py-4 rounded-xl font-bold text-white bg-indigo-900 active:scale-95 transition-all shadow-sm shadow-[0_2px_8px_rgba(0,0,0,0.04)] disabled:opacity-40"
            >
              Delegate Now
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DelegationModal;
