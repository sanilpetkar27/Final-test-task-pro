import React, { useState } from 'react';
import { Employee } from '../types';
import { ClipboardList, Mail, Eye, EyeOff, ArrowRight, Lock, Loader2, AlertCircle, ShieldCheck, Info, Building2, User, Phone } from 'lucide-react';
import { supabase, supabaseAuth } from '../src/lib/supabase';
import { toast } from 'sonner';
import { handleSignup, handleLogin } from '../src/utils/auth';

interface LoginScreenProps {
  employees: Employee[];
  onLogin: (user: Employee) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ employees, onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Signup form states
  const [companyName, setCompanyName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminMobile, setAdminMobile] = useState('');

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Force logout to prevent data leakage
      await supabaseAuth.signOut();
      
      if (!supabase) {
        setError('Signup not available in demo mode. Please use real credentials.');
        return;
      }

      // Skip table check for now and try direct company creation
      console.log('Attempting direct company creation...');

      // Step 1: Create company
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .insert([{ name: companyName, subscription_status: 'active' }])
        .select();

      console.log('Company creation result:', { companyData, companyError });

      if (companyError) {
        setError(`Company creation failed: ${companyError.message || 'Please try again.'}`);
        console.error('Company creation error:', companyError);
        return;
      }

      if (!companyData || companyData.length === 0) {
        setError('Failed to create company. No data returned.');
        return;
      }

      const newCompany = companyData[0];

      // Step 2: Create admin user in Supabase Auth
      const { data: authData, error: authError } = await supabaseAuth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            company_id: newCompany.id,
            role: 'super_admin',
            name: adminName,
            mobile: adminMobile,
          }
        }
      });

      if (authError) {
        setError(`Account creation failed: ${authError.message || 'Please try again.'}`);
        console.error('Auth signup error:', authError);
        return;
      }

      if (authData.user) {
        // Step 3: Create employee record with retry logic
        let employeeData;
        let employeeError;
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
          console.log(`🔄 Employee creation attempt ${retryCount + 1}/${maxRetries}`);
          
          const { data: empData, error: empError } = await supabase
            .from('employees')
            .upsert({
              id: authData.user.id, // Matches Auth User ID
              name: adminName,
              mobile: adminMobile,
              role: 'super_admin',
              points: 0,
              company_id: newCompany.id, // Uses company_id from Step 1
              updated_at: new Date().toISOString()
            }, { onConflict: 'id' }) // Critical: This fixes the duplicate key error
            .select()
            .single();

          console.log(`Employee upsert result (attempt ${retryCount + 1}):`, { empData, empError });

          if (!empError && empData) {
            employeeData = Array.isArray(empData) ? empData[0] : empData;
            employeeError = null;
            break; // Success - exit retry loop
          } else if (empError) {
            employeeError = empError;
          } else {
            // No data returned, try again
            employeeError = new Error('No employee data returned');
          }

          if (employeeError) {
            retryCount++;
            if (retryCount < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms before retry
            }
          } else {
            break; // Max retries reached or success
          }
        }

        if (employeeError) {
          setError(`Employee profile failed: ${employeeError.message || 'Please contact support.'}`);
          console.error('Employee creation error:', employeeError);
          return;
        }

        if (!employeeData) {
          setError('Failed to create employee profile. Please contact support.');
          return;
        }

        const newEmployee = employeeData;
        console.log('🎉 New employee created:', newEmployee);
        console.log('🎉 Calling onLogin with employee:', newEmployee);
        
        // Auto-login if session exists, otherwise show success message
        if (authData.session) {
          onLogin(newEmployee);
          toast.success('Company account created successfully!');
        } else {
          // Email verification required
          onLogin(newEmployee);
          toast.success('Account created! Please check your email to verify.');
        }
      }
    } catch (err) {
      setError(`Signup failed: ${err instanceof Error ? err.message : 'Unknown error occurred'}`);
      console.error('Signup exception:', err);
    } finally {
      setLoading(false);
    }
  };

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
        
        // Find employee by Auth ID from database to get role and other details
        const { data: employeeData, error: employeeError } = await supabase
          .from('employees')
          .select('*')
          .eq('id', data.user.id)
          .single();

        console.log('👤 Employee lookup from database:', { employeeData, employeeError });
        
        if (employeeError || !employeeData) {
          setError('Profile missing. Please contact Admin.');
        } else {
          onLogin(employeeData);
          toast.success('Login successful!');
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
                {isLogin ? <ShieldCheck className="w-8 h-8 text-blue-400" /> : <Building2 className="w-8 h-8 text-blue-400" />}
                <div>
                  <h1 className="text-2xl font-black text-white">TaskPro</h1>
                  <p className="text-blue-200 text-sm">{isLogin ? 'Secure Employee Portal' : 'Create Company Account'}</p>
                </div>
              </div>
              <p className="text-slate-400 text-xs">{isLogin ? 'Enter your credentials to access system' : 'Create your company account'}</p>
            </div>

            {/* Toggle Buttons */}
            <div className="flex gap-2 mb-6">
              <button
                type="button"
                onClick={() => setIsLogin(true)}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
                  isLogin 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => setIsLogin(false)}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
                  !isLogin 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                Sign Up
              </button>
            </div>

            {/* Login Form */}
            {isLogin ? (
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
                  {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <><span>Sign In</span> <ArrowRight className="w-5 h-5" /></>}
                </button>
              </form>
            ) : (
              /* Signup Form */
              <form onSubmit={handleSignup} className="space-y-6">
                <div>
                  <label htmlFor="companyName" className="block text-sm font-medium text-slate-300 mb-2">
                    Company Name
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      id="companyName"
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Your Company Name"
                      className="w-full bg-slate-800/50 border border-slate-600 rounded-xl px-12 py-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="adminName" className="block text-sm font-medium text-slate-300 mb-2">
                    Admin Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      id="adminName"
                      type="text"
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      placeholder="Admin Full Name"
                      className="w-full bg-slate-800/50 border border-slate-600 rounded-xl px-12 py-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="adminMobile" className="block text-sm font-medium text-slate-300 mb-2">
                    Mobile Number
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      id="adminMobile"
                      type="tel"
                      value={adminMobile}
                      onChange={(e) => setAdminMobile(e.target.value)}
                      placeholder="+1234567890"
                      className="w-full bg-slate-800/50 border border-slate-600 rounded-xl px-12 py-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="signupEmail" className="block text-sm font-medium text-slate-300 mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      id="signupEmail"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@company.com"
                      className="w-full bg-slate-800/50 border border-slate-600 rounded-xl px-12 py-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="signupPassword" className="block text-sm font-medium text-slate-300 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      id="signupPassword"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create a strong password"
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
                  disabled={loading || !email.trim() || !password.trim() || !companyName.trim() || !adminName.trim() || !adminMobile.trim()}
                  className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-black py-5 rounded-lg shadow-lg shadow-indigo-100 active:scale-95 transition-all duration-200 flex items-center justify-center gap-3 disabled:opacity-40"
                >
                  {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <><span>Create Company</span> <ArrowRight className="w-5 h-5" /></>}
                </button>
              </form>
            )}

            {/* Info Section */}
            <div className="mt-8 p-4 bg-slate-800/30 rounded-2xl border border-slate-700/30">
              <div className="flex items-start gap-3">
                <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-slate-400 text-xs leading-relaxed">
                    <strong className="text-slate-300">{isLogin ? 'Secure Access:' : 'Company Setup:'}</strong> {isLogin ? 'Your login credentials are encrypted and protected with enterprise-grade security.' : 'Create your company account and start managing tasks efficiently.'}
                  </p>
                  <p className="text-slate-400 text-xs leading-relaxed mt-2">
                    <strong className="text-slate-300">{isLogin ? 'Need Help?' : 'Questions?'}</strong> {isLogin ? 'Contact your system administrator for account access.' : 'Contact support for assistance with your company setup.'}
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
