
import React, { useState, useEffect } from 'react';
import { Employee } from '../types';
import { ClipboardList, Smartphone, ArrowRight, KeyRound, Lock, Loader2, AlertCircle, RefreshCw, ShieldCheck, Info } from 'lucide-react';

interface LoginScreenProps {
  employees: Employee[];
  onLogin: (user: Employee) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ employees, onLogin }) => {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingUser, setPendingUser] = useState<Employee | null>(null);
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    let interval: any;
    if (timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  const handleSendOtp = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');
    setLoading(true);

    setTimeout(() => {
      const user = employees.find(e => e.mobile === mobile);
      if (user) {
        setPendingUser(user);
        setStep('otp');
        setTimer(30);
        // OTP is hardcoded for the demo version but logged to console for the operator
        console.log(`SECURE_GATEWAY_SYSTEM: OTP for ${user.name} is 1234`);
      } else {
        setError('Access Denied: Mobile number not registered.');
      }
      setLoading(false);
    }, 1500);
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    setTimeout(() => {
      if (otp === '1234') {
        if (pendingUser) onLogin(pendingUser);
      } else {
        setError('Invalid Security Code. Please retry.');
        setOtp('');
      }
      setLoading(false);
    }, 1200);
  };

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-[#0F172A] items-center justify-center p-8 relative overflow-hidden font-sans">
      {/* Premium Gradient Overlays */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[120%] h-[50%] bg-blue-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[80%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full" />
      </div>

      <div className="z-10 w-full">
        <div className="flex justify-center mb-12">
          <div className="bg-gradient-to-br from-blue-500 to-blue-700 p-5 rounded-[2.5rem] shadow-[0_20px_50px_rgba(59,130,246,0.3)] animate-pulse-slow">
            <ClipboardList className="w-10 h-10 text-white" />
          </div>
        </div>
        
        <div className="text-center mb-12">
          <h1 className="text-4xl font-black text-white mb-2 tracking-tight italic">Task<span className="text-blue-500">Pro</span></h1>
          <div className="flex items-center justify-center gap-2 text-slate-500 text-xs font-bold uppercase tracking-[0.2em]">
            <ShieldCheck className="w-3.5 h-3.5" />
            Secure Login
          </div>
        </div>

        <div className="bg-slate-800/40 border border-slate-700/50 backdrop-blur-xl p-8 rounded-[2.5rem] shadow-2xl relative">
          {step === 'phone' ? (
            <form onSubmit={handleSendOtp} className="space-y-6 animate-in fade-in duration-500">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Registered Mobile</label>
                <div className="relative group">
                  <input 
                    type="tel" 
                    value={mobile}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                      setMobile(val);
                      setError('');
                    }}
                    placeholder="Enter mobile number"
                    className="w-full bg-slate-900/50 border border-slate-700 text-white rounded-2xl pl-12 pr-4 py-4 text-xl font-bold tracking-widest focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-700"
                    autoFocus
                  />
                  <Smartphone className="w-5 h-5 text-slate-500 group-focus-within:text-blue-500 absolute left-4 top-1/2 -translate-y-1/2 transition-colors" />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-3 text-red-400 text-xs font-bold bg-red-400/10 p-4 rounded-2xl border border-red-400/20">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <button 
                type="submit"
                disabled={mobile.length < 10 || loading}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-5 rounded-2xl shadow-xl shadow-blue-900/40 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-40"
              >
                {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <>Identify Access <ArrowRight className="w-5 h-5" /></>}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-6 animate-in slide-in-from-right duration-400">
              <div className="text-center mb-6">
                <p className="text-slate-400 text-xs mb-1">Authorization required for</p>
                <p className="text-white font-black tracking-widest text-xl">+91 {mobile}</p>
              </div>

              <div className="space-y-3">
                <div className="relative">
                  <input 
                    type="text" 
                    value={otp}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                      setOtp(val);
                      setError('');
                    }}
                    placeholder="••••"
                    className="w-full bg-slate-900/50 border border-slate-700 text-white rounded-2xl pl-12 pr-4 py-5 text-center text-4xl font-black tracking-[0.5em] focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-800"
                    autoFocus
                  />
                  <KeyRound className="w-6 h-6 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-3 text-red-400 text-xs font-bold bg-red-400/10 p-4 rounded-2xl border border-red-400/20">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <button 
                type="submit"
                disabled={otp.length < 4 || loading}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-5 rounded-2xl shadow-xl shadow-blue-900/40 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-40"
              >
                {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <>Verify Identity <Lock className="w-5 h-5" /></>}
              </button>

              <div className="flex flex-col gap-3">
                <button 
                  type="button"
                  disabled={timer > 0 || loading}
                  onClick={() => handleSendOtp()}
                  className="w-full text-blue-400 text-[10px] font-black uppercase hover:text-blue-300 transition-colors py-2 disabled:opacity-30"
                >
                  {timer > 0 ? `Resend security code in ${timer}s` : 'Request New Code'}
                </button>
                <button 
                  type="button"
                  onClick={() => { setStep('phone'); setOtp(''); setError(''); }}
                  className="w-full text-slate-600 text-[9px] font-black uppercase hover:text-slate-400 transition-colors"
                >
                  Return to Phone Input
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="mt-16 text-center space-y-4">
           <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Authorized Users Only</p>
           <div className="flex justify-center gap-6 text-[9px] font-bold text-slate-700 uppercase">
              <span className="cursor-pointer hover:text-slate-500">Security Policy</span>
              <span className="cursor-pointer hover:text-slate-500">System Terms</span>
           </div>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
