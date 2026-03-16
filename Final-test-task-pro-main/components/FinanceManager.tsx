
import React, { useState } from 'react';
import { FinanceRecord } from '../types';
import { Plus, Trash2, Calendar, Banknote, ShieldAlert, History } from 'lucide-react';

interface FinanceManagerProps {
  records: FinanceRecord[];
  onAddRecord: (record: Omit<FinanceRecord, 'id'>) => void;
  onRemoveRecord: (id: string) => void;
}

const FinanceManager: React.FC<FinanceManagerProps> = ({ records, onAddRecord, onRemoveRecord }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({
    lenderName: '',
    type: 'Trade Advance' as FinanceRecord['type'],
    amount: '',
    dueDate: '',
    description: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.lenderName || !formData.amount || !formData.dueDate) return;

    onAddRecord({
      lenderName: formData.lenderName,
      type: formData.type,
      status: 'pending', // Default status
      amount: parseFloat(formData.amount),
      dueDate: new Date(formData.dueDate).getTime(),
      description: formData.description
    });

    setFormData({
      lenderName: '',
      type: 'Trade Advance',
      amount: '',
      dueDate: '',
      description: ''
    });
    setIsAdding(false);
  };

  const getDaysRemaining = (timestamp: number) => {
    const diff = timestamp - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const totalOutstanding = records.filter(r => r.status !== 'paid').reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="space-y-6 pb-20">
      {/* Financial Summary */}
      <div className="bg-gradient-to-br from-slate-800 to-indigo-900 p-6 rounded-3xl text-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-slate-200 text-xs font-bold uppercase tracking-widest mb-1">Total Outstanding</p>
            <h2 className="text-3xl font-black italic">₹{totalOutstanding.toLocaleString()}</h2>
          </div>
          <div className="bg-white/20 p-2 rounded-xl">
            <Banknote className="w-6 h-6" />
          </div>
        </div>
        <div className="flex gap-2 text-[10px] font-bold">
          <span className="bg-white/20 px-2 py-1 rounded-full">{records.filter(r => r.status === 'pending' || r.status === 'overdue').length} Active Accounts</span>
        </div>
      </div>

      {/* Add Button/Form */}
      {!isAdding ? (
        <button 
          onClick={() => setIsAdding(true)}
          className="w-full bg-white border-2 border-dashed border-slate-300 p-6 rounded-2xl flex flex-col items-center justify-center gap-2 text-slate-500 hover:bg-slate-100 transition-colors"
        >
          <div className="bg-slate-100 p-3 rounded-full">
            <Plus className="w-6 h-6" />
          </div>
          <span className="font-bold">Register New Funding/Loan</span>
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4 animate-in zoom-in-95 duration-200">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-800">New Finance Entry</h3>
            <button type="button" onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600 text-xs font-bold uppercase">Cancel</button>
          </div>
          
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Financial Institution</label>
              <input 
                type="text" 
                required
                value={formData.lenderName}
                onChange={e => setFormData({...formData, lenderName: e.target.value})}
                placeholder="e.g. HDFC Bank, Cholamandalam..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:ring-2 focus:ring-slate-800 outline-none"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Type</label>
                <select 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 outline-none"
                  value={formData.type}
                  onChange={e => setFormData({...formData, type: e.target.value as any})}
                >
                  <option className="text-slate-900">Trade Advance</option>
                  <option className="text-slate-900">Inventory Funding</option>
                  <option className="text-slate-900">Working Capital</option>
                  <option className="text-slate-900">Other</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Amount (₹)</label>
                <input 
                  type="number" 
                  required
                  value={formData.amount}
                  onChange={e => setFormData({...formData, amount: e.target.value})}
                  placeholder="0.00"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Payment Due Date</label>
              <input 
                type="date" 
                required
                value={formData.dueDate}
                onChange={e => setFormData({...formData, dueDate: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 outline-none"
              />
            </div>
          </div>

          <button 
            type="submit"
            className="w-full bg-indigo-900 hover:bg-indigo-800 text-white font-bold py-4 rounded-xl shadow-sm active:scale-95 transition-transform"
          >
            Add Finance Record
          </button>
        </form>
      )}

      {/* Records List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Outstanding Obligations</h3>
          <History className="w-4 h-4 text-slate-300" />
        </div>
        
        {records.length > 0 ? (
          records.sort((a,b) => a.dueDate - b.dueDate).map(record => {
            const daysLeft = getDaysRemaining(record.dueDate);
            const isUrgent = daysLeft <= 7;
            const isOverdue = daysLeft < 0;

            return (
              <div 
                key={record.id}
                className={`bg-white rounded-2xl p-4 border shadow-sm flex items-center gap-4 ${isUrgent ? 'border-amber-200 bg-amber-50/30' : 'border-slate-200'}`}
              >
                <div className={`p-3 rounded-xl shrink-0 ${isUrgent ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                  {record.type === 'Trade Advance' ? <Banknote className="w-6 h-6" /> : <Calendar className="w-6 h-6" />}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-black bg-slate-800 text-white px-1.5 py-0.5 rounded uppercase tracking-tighter">
                      {record.type}
                    </span>
                    <h4 className="font-bold text-slate-800 truncate">{record.lenderName}</h4>
                  </div>
                  <p className="text-xl font-black text-slate-900 leading-none">₹{record.amount.toLocaleString()}</p>
                  
                  <div className="flex items-center gap-2 mt-2">
                    {isOverdue ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 uppercase">
                        <ShieldAlert className="w-3 h-3" />
                        Overdue by {Math.abs(daysLeft)} days
                      </span>
                    ) : (
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase ${isUrgent ? 'text-amber-600' : 'text-slate-400'}`}>
                        <Calendar className="w-3 h-3" />
                        Due in {daysLeft} days
                      </span>
                    )}
                  </div>
                </div>

                <button 
                  onClick={() => onRemoveRecord(record.id)}
                  className="p-3 text-slate-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            );
          })
        ) : (
          <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-200">
            <Banknote className="w-12 h-12 mx-auto mb-3 text-slate-200" />
            <p className="text-slate-400 font-medium">No financial records yet.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FinanceManager;
