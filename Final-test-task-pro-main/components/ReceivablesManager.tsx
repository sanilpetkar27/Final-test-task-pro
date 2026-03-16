
import React, { useState } from 'react';
import { ReceivableRecord } from '../types';
import { Plus, Trash2, Calendar, TrendingUp, ArrowDownToLine, History, Sparkles } from 'lucide-react';

interface ReceivablesManagerProps {
  records: ReceivableRecord[];
  onAddRecord: (record: Omit<ReceivableRecord, 'id'>) => void;
  onRemoveRecord: (id: string) => void;
}

const ReceivablesManager: React.FC<ReceivablesManagerProps> = ({ records, onAddRecord, onRemoveRecord }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({
    sourceName: '',
    category: 'OEM Incentive' as ReceivableRecord['category'],
    amount: '',
    expectedDate: '',
    description: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.sourceName || !formData.amount || !formData.expectedDate) return;

    onAddRecord({
      sourceName: formData.sourceName,
      category: formData.category,
      amount: parseFloat(formData.amount),
      expectedDate: new Date(formData.expectedDate).getTime(),
      description: formData.description
    });

    setFormData({
      sourceName: '',
      category: 'OEM Incentive',
      amount: '',
      expectedDate: '',
      description: ''
    });
    setIsAdding(false);
  };

  const getDaysRemaining = (timestamp: number) => {
    const diff = timestamp - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const totalReceivable = records.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="space-y-6 pb-20">
      {/* Summary Card */}
      <div className="bg-gradient-to-br from-slate-800 to-indigo-900 p-6 rounded-2xl text-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-slate-300 text-xs font-bold uppercase tracking-widest mb-1">Total Receivable</p>
            <h2 className="text-3xl font-black italic">₹{totalReceivable.toLocaleString()}</h2>
          </div>
          <div className="bg-white/15 p-2 rounded-xl">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>
        <div className="flex gap-2 text-[10px] font-bold">
          <span className="bg-white/15 px-2 py-1 rounded-full">{records.length} Expected Payouts</span>
        </div>
      </div>

      {/* Add Button/Form */}
      {!isAdding ? (
        <button 
          onClick={() => setIsAdding(true)}
          className="w-full bg-white border-2 border-dashed border-slate-300 p-6 rounded-2xl flex flex-col items-center justify-center gap-2 text-slate-500 hover:bg-slate-100 transition-colors"
        >
          <div className="bg-indigo-50 p-3 rounded-full text-indigo-700">
            <Plus className="w-6 h-6" />
          </div>
          <span className="font-bold">Register New Receivable</span>
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4 animate-in zoom-in-95 duration-200">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-800">New Income Track</h3>
            <button type="button" onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600 text-xs font-bold uppercase">Cancel</button>
          </div>
          
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Source (Who owes you?)</label>
              <input 
                type="text" 
                required
                value={formData.sourceName}
                onChange={e => setFormData({...formData, sourceName: e.target.value})}
                placeholder="e.g. Maruti Suzuki, Tata Motors, ICICI Insurance..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:ring-2 focus:ring-slate-800 outline-none"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Category</label>
                <select 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 outline-none"
                  value={formData.category}
                  onChange={e => setFormData({...formData, category: e.target.value as any})}
                >
                  <option className="text-slate-900">OEM Incentive</option>
                  <option className="text-slate-900">Insurance Payout</option>
                  <option className="text-slate-900">Finance Payout</option>
                  <option className="text-slate-900">Warranty Payout</option>
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
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Expected Receipt Date</label>
              <input 
                type="date" 
                required
                value={formData.expectedDate}
                onChange={e => setFormData({...formData, expectedDate: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 outline-none"
              />
            </div>
          </div>

          <button 
            type="submit"
            className="w-full bg-indigo-900 hover:bg-indigo-800 text-white font-bold py-4 rounded-xl shadow-sm active:scale-95 transition-transform"
          >
            Track Receivable
          </button>
        </form>
      )}

      {/* Records List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Awaited Inflow</h3>
          <ArrowDownToLine className="w-4 h-4 text-slate-300" />
        </div>
        
        {records.length > 0 ? (
          records.sort((a,b) => a.expectedDate - b.expectedDate).map(record => {
            const daysLeft = getDaysRemaining(record.expectedDate);
            const isSoon = daysLeft <= 5 && daysLeft >= 0;
            const isDelayed = daysLeft < 0;

            return (
              <div 
                key={record.id}
                className={`bg-white rounded-2xl p-4 border shadow-sm flex items-center gap-4 ${isSoon ? 'border-indigo-200 bg-indigo-50/30' : 'border-slate-200'}`}
              >
                <div className={`p-3 rounded-xl shrink-0 ${isSoon ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                  {record.category === 'OEM Incentive' ? <Sparkles className="w-6 h-6" /> : <ArrowDownToLine className="w-6 h-6" />}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[9px] font-black bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded uppercase tracking-tighter">
                      {record.category}
                    </span>
                    <h4 className="font-bold text-slate-800 truncate">{record.sourceName}</h4>
                  </div>
                  <p className="text-xl font-black text-slate-900 leading-none">₹{record.amount.toLocaleString()}</p>
                  
                  <div className="flex items-center gap-2 mt-2">
                    {isDelayed ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-600 uppercase">
                        Delayed by {Math.abs(daysLeft)} days
                      </span>
                    ) : (
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase ${isSoon ? 'text-indigo-700' : 'text-slate-400'}`}>
                        <Calendar className="w-3 h-3" />
                        Expected in {daysLeft} days
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
          <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200">
            <ArrowDownToLine className="w-12 h-12 mx-auto mb-3 text-slate-200" />
            <p className="text-slate-400 font-medium">No pending receivables recorded.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReceivablesManager;
