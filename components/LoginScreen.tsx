
import React, { useState } from 'react';
import { Employee } from '../types';
import { ClipboardList, Mail, Eye, EyeOff, ArrowRight, Lock, Loader2, AlertCircle, ShieldCheck, Info } from 'lucide-react';
import { supabaseAuth } from '../src/lib/supabase';
import { toast } from 'sonner';

interface LoginScreenProps {
  employees: Employee[];
  onLogin: (user: Employee) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ employees, onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data, error } = await supabaseAuth.signInWithPassword({
        email: email,
        password: password
      });

      if (error) {
        setError('Invalid email or password. Please try again.');
        console.error('Login error:', error);
      } else if (data.user) {
        console.log('🔐 Auth ID from login:', data.user.id);
        
        // Find employee by Auth ID to get role and other details
        const employee = employees.find(emp => emp.id === data.user.id);
        console.log('👤 Employee lookup in LoginScreen:', employee);
        
        if (employee) {
          onLogin(employee);
          toast.success('Login successful!');
        } else {
          setError('Profile missing. Please contact Admin.');
        }
      }
    } catch (err) {
      setError('Login failed. Please try again.');
      console.error('Login exception:', err);
    } finally {
      setLoading(false);
    }
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

        <div className="w-full max-w-sm mx-auto">
          <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-8 border border-white/10 shadow-2xl">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-3 bg-blue-600/20 p-4 rounded-2xl mb-4">
                <ShieldCheck className="w-8 h-8 text-blue-400" />
                <div>
                  <h1 className="text-2xl font-black text-white">TaskPro</h1>
                  <p className="text-blue-200 text-sm">Secure Employee Portal</p>
                </div>
              </div>
              <p className="text-slate-400 text-xs">Enter your credentials to access the system</p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="john@company.com"
                    className="w-full bg-slate-800/50 border border-slate-600 rounded-xl px-12 py-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full bg-slate-800/50 border border-slate-600 rounded-xl px-12 py-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all pr-12"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
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
                disabled={loading || !email.trim() || !password.trim()}
                className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-black py-5 rounded-lg shadow-lg shadow-indigo-100 active:scale-95 transition-all duration-200 flex items-center justify-center gap-3 disabled:opacity-40"
              >
                {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <>Sign In <ArrowRight className="w-5 h-5" /></>}
              </button>
            </form>

            {/* Info Section */}
            <div className="mt-8 p-4 bg-slate-800/30 rounded-2xl border border-slate-700/30">
              <div className="flex items-start gap-3">
                <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-slate-400 text-xs leading-relaxed">
                    <strong className="text-slate-300">Secure Access:</strong> Your login credentials are encrypted and protected with enterprise-grade security.
                  </p>
                  <p className="text-slate-400 text-xs leading-relaxed mt-2">
                    <strong className="text-slate-300">Need Help?</strong> Contact your system administrator for account access.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
