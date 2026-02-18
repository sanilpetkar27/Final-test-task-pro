import React, { useState } from 'react';
import { Employee } from '../types';
import { ClipboardList, Mail, Eye, EyeOff, ArrowRight, Lock, Loader2, AlertCircle, ShieldCheck, Info, Building2, User, Phone } from 'lucide-react';
import { supabase, supabaseAuth } from '../src/lib/supabase';
import { toast } from 'sonner';

// --- HELPER FUNCTIONS (Comprehensive Auth Fixes) ---

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const DEFAULT_COMPANY_ID = '00000000-0000-0000-0000-000000000001';

const normalizeRole = (role: unknown): Employee['role'] => {
  return role === 'owner' || role === 'manager' || role === 'staff' || role === 'super_admin'
    ? role
    : 'staff';
};

const isEmployeesPolicyError = (error: any): boolean => {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('infinite recursion') && message.includes('employees');
};

const toFallbackEmployee = (authUser: any, overrides: Partial<Employee> = {}): Employee => {
  const metadata = authUser?.user_metadata || {};
  const inferredEmail = String(overrides.email || authUser?.email || metadata.email || '').trim();
  const inferredName = String(overrides.name || metadata.name || inferredEmail.split('@')[0] || 'User').trim();
  const inferredMobile = String(overrides.mobile || metadata.mobile || '').trim();

  return {
    id: String(overrides.id || authUser?.id || `temp-${Date.now()}`),
    name: inferredName || 'User',
    email: inferredEmail || `${authUser?.id || 'user'}@taskpro.local`,
    mobile: inferredMobile || String(authUser?.id || '0000000000').slice(0, 10),
    role: normalizeRole(overrides.role || metadata.role),
    points: Number(overrides.points || 0),
    company_id: String(overrides.company_id || metadata.company_id || DEFAULT_COMPANY_ID),
  };
};

const fetchEmployeeById = async (id: string) => {
  return supabase
    .from('employees')
    .select('*')
    .eq('id', id)
    .maybeSingle();
};

const normalizeMobile = (mobile: unknown): string => {
  return String(mobile || '').replace(/\D/g, '');
};

const isMissingColumnError = (error: any): boolean => {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('column') && message.includes('does not exist');
};

const findLegacyEmployeeProfile = async (authUser: any): Promise<Employee | null> => {
  const authUserId = String(authUser?.id || '').trim();
  const authEmail = String(authUser?.email || '').trim().toLowerCase();
  const authMobile = normalizeMobile(authUser?.user_metadata?.mobile || authUser?.phone || '');
  const authCompanyId = String(authUser?.user_metadata?.company_id || '').trim();

  if (authUserId) {
    let byAuthUserIdQuery = supabase
      .from('employees')
      .select('*')
      .eq('auth_user_id', authUserId)
      .limit(1);

    if (authCompanyId) {
      byAuthUserIdQuery = byAuthUserIdQuery.eq('company_id', authCompanyId);
    }

    const { data: byAuthUserId, error: authUserIdError } = await byAuthUserIdQuery.maybeSingle();

    if (byAuthUserId) {
      return byAuthUserId as Employee;
    }

    if (authUserIdError && !isMissingColumnError(authUserIdError) && !isEmployeesPolicyError(authUserIdError)) {
      console.warn('Legacy profile lookup by auth_user_id failed:', authUserIdError);
    }
  }

  if (authEmail) {
    let byEmailQuery = supabase
      .from('employees')
      .select('*')
      .eq('email', authEmail)
      .limit(1);

    if (authCompanyId) {
      byEmailQuery = byEmailQuery.eq('company_id', authCompanyId);
    }

    const { data: byEmail, error: emailError } = await byEmailQuery.maybeSingle();

    if (byEmail) {
      return byEmail as Employee;
    }

    if (emailError && !isMissingColumnError(emailError) && !isEmployeesPolicyError(emailError)) {
      console.warn('Legacy profile lookup by email failed:', emailError);
    }
  }

  if (authMobile) {
    let mobileQuery = supabase
      .from('employees')
      .select('*')
      .limit(200);

    if (authCompanyId) {
      mobileQuery = mobileQuery.eq('company_id', authCompanyId);
    }

    const { data: mobileMatches, error: mobileError } = await mobileQuery;

    if (mobileMatches && mobileMatches.length > 0) {
      const matchedByMobile = mobileMatches.find((emp: any) => normalizeMobile(emp?.mobile) === authMobile);
      if (matchedByMobile) {
        return matchedByMobile as Employee;
      }
    }

    if (mobileError && !isEmployeesPolicyError(mobileError)) {
      console.warn('Legacy profile lookup by mobile failed:', mobileError);
    }
  }

  return null;
};

/**
 * Handles robust login with retry logic to prevent race conditions
 */
const handleAuthLogin = async (email: string, password: string) => {
  console.log('Starting login for:', email);

  const { data: authData, error: authError } = await supabaseAuth.signInWithPassword({
    email,
    password,
  });

  if (authError) {
    console.error('Auth error:', authError);
    throw authError;
  }

  if (!authData.user) {
    throw new Error('Login failed: missing auth user.');
  }

  console.log('Auth successful for user:', authData.user.id);

  let attempts = 0;
  let employeeData: Employee | null = null;
  let lastEmployeeError: any = null;

  while (attempts < 3 && !employeeData) {
    const { data, error } = await fetchEmployeeById(authData.user.id);
    lastEmployeeError = error;

    if (!error && data) {
      employeeData = data as Employee;
      console.log('Employee data found:', employeeData);
      break;
    }

    if (isEmployeesPolicyError(error)) {
      console.warn('Employee policy issue detected. Falling back to auth metadata profile.');
      break;
    }

    console.log(`Attempt ${attempts + 1}: Employee DB record not ready yet, waiting...`);
    await delay(1000);
    attempts++;
  }

  if (!employeeData) {
    const legacyEmployee = await findLegacyEmployeeProfile(authData.user);

    if (legacyEmployee) {
      if (legacyEmployee.id !== authData.user.id) {
        console.log('Using legacy employee profile linked by identity:', legacyEmployee.id);
      }
      return { user: authData.user, employee: legacyEmployee, usedFallback: false };
    }
  }

  if (!employeeData) {
    const fallbackEmployee = toFallbackEmployee(authData.user);

    const { error: upsertError } = await supabase
      .from('employees')
      .upsert({
        id: fallbackEmployee.id,
        email: fallbackEmployee.email,
        name: fallbackEmployee.name,
        mobile: fallbackEmployee.mobile,
        role: fallbackEmployee.role,
        points: fallbackEmployee.points,
        company_id: fallbackEmployee.company_id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (!upsertError) {
      const { data: recoveredEmployee } = await fetchEmployeeById(authData.user.id);
      if (recoveredEmployee) {
        return { user: authData.user, employee: recoveredEmployee as Employee, usedFallback: false };
      }
    } else {
      console.warn('Employee sync failed during login:', upsertError);
    }

    console.warn('Using fallback profile for login.', lastEmployeeError || upsertError);
    return { user: authData.user, employee: fallbackEmployee, usedFallback: true };
  }

  return { user: authData.user, employee: employeeData, usedFallback: false };
};

/**
 * Handles robust signup with forced logout to prevent data leakage
 */
const handleAuthSignup = async (companyName: string, adminName: string, mobile: string, email: string, password: string) => {
  console.log('Starting clean signup process...');

  await supabaseAuth.signOut();
  localStorage.clear();

  const { data: authData, error: authError } = await supabaseAuth.signUp({
    email,
    password,
    options: {
      data: {
        role: 'super_admin',
        name: adminName,
        mobile,
      },
    },
  });

  if (authError) throw authError;
  if (!authData.user) throw new Error('User creation failed');

  let activeSession = authData.session || null;
  if (!activeSession) {
    const { data: signInData, error: signInError } = await supabaseAuth.signInWithPassword({
      email,
      password,
    });

    if (!signInError && signInData.session) {
      activeSession = signInData.session;
    }
  }

  if (!activeSession) {
    throw new Error(
      'Account created, but no active session yet. Please verify your email, then sign in once to finish company setup.'
    );
  }

  const { data: newCompany, error: companyError } = await supabase
    .from('companies')
    .insert({
      name: companyName,
      subscription_status: 'active',
    })
    .select()
    .single();

  if (companyError) throw companyError;

  const { error: metadataError } = await supabaseAuth.updateUser({
    data: {
      company_id: newCompany.id,
      role: 'super_admin',
      name: adminName,
      mobile,
    },
  });

  if (metadataError) {
    console.warn('Auth metadata update failed during signup:', metadataError);
  }

  const fallbackEmployee = toFallbackEmployee(authData.user, {
    id: authData.user.id,
    email: email.trim(),
    name: adminName.trim(),
    mobile: mobile.trim(),
    role: 'super_admin',
    company_id: newCompany.id,
    points: 0,
  });

  let profileSynced = true;

  const { error: employeeError } = await supabase
    .from('employees')
    .upsert({
      id: authData.user.id,
      name: adminName,
      mobile,
      role: 'super_admin',
      email,
      company_id: newCompany.id,
      points: 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

  if (employeeError) {
    profileSynced = false;
    if (isEmployeesPolicyError(employeeError)) {
      console.warn('Employee profile sync skipped due to DB policy recursion.');
    } else {
      console.warn('Employee profile sync failed:', employeeError);
    }
  }

  return {
    user: authData.user,
    session: activeSession,
    employee: fallbackEmployee,
    profileSynced,
  };
};

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        // --- LOGIN FLOW ---
        const result = await handleAuthLogin(email, password);
        let loginEmployee = result.employee;
        let usedFallback = result.usedFallback;

        if (usedFallback) {
          const emailMatch = employees.find(
            (emp) => String(emp.email || '').trim().toLowerCase() === String(email).trim().toLowerCase()
          );

          if (emailMatch) {
            loginEmployee = emailMatch;
            usedFallback = false;
          }
        }

        if (usedFallback) {
          try {
            const rawCached = localStorage.getItem('universal_app_user');
            if (rawCached) {
              const cached = JSON.parse(rawCached) as Employee;
              const sameEmail =
                String(cached?.email || '').trim().toLowerCase() === String(email).trim().toLowerCase();
              const hasPrivilegedRole =
                cached?.role === 'manager' || cached?.role === 'super_admin' || cached?.role === 'owner';

              if (sameEmail && hasPrivilegedRole) {
                loginEmployee = cached;
                usedFallback = false;
              }
            }
          } catch (cacheError) {
            console.warn('Could not read cached profile during fallback login:', cacheError);
          }
        }

        onLogin(loginEmployee);
        if (usedFallback) {
          toast.warning('Logged in, but profile sync is pending. Please contact admin if this persists.');
        } else {
          toast.success('Welcome back!');
        }
      } else {
        // --- SIGNUP FLOW ---
        const result = await handleAuthSignup(companyName, adminName, adminMobile, email, password);

        if (result.session) {
          // Auto-login if session exists (Email confirmation disabled)
          onLogin(result.employee);
          toast.success('Company registered successfully!');
        } else {
          // Email confirmation enabled
          setIsLogin(true);
          toast.success('Registration successful! Please verify your email, then sign in.');
        }

        if (!result.profileSynced) {
          toast.warning('Account created, but employee profile sync is pending.');
        }
      }
    } catch (error: any) {
      console.error('Auth Error:', error);
      const message = error?.message || 'Authentication failed';

      // Defensive fallback for any legacy path still returning the old profile-ready error.
      if (isLogin && String(message).toLowerCase().includes('employee profile is not ready')) {
        try {
          const { data: { session } } = await supabaseAuth.getSession();
          if (session?.user) {
            const fallbackEmployee = toFallbackEmployee(session.user);
            onLogin(fallbackEmployee);
            toast.warning('Logged in with fallback profile. Profile sync will complete shortly.');
            return;
          }
        } catch (sessionError) {
          console.warn('Fallback login after legacy error failed:', sessionError);
        }
      }

      setError(message);
      toast.error(message);
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
              <form onSubmit={handleSubmit} className="space-y-6">
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
              <form onSubmit={handleSubmit} className="space-y-6">
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
