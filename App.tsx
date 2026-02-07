import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppTab, DealershipTask, Employee, UserRole, TaskStatus, RewardConfig } from './types';
import Dashboard from './components/Dashboard';
import StatsScreen from './components/StatsScreen';
import TeamManager from './components/TeamManager';
import LoginScreen from './components/LoginScreen';
import { supabase } from './src/lib/supabase';
import { useNotificationSetup } from './src/hooks/useNotificationSetup';
import {
  ClipboardList,
  Users,
  LayoutDashboard,
  LogOut,
  Loader2,
  AlertTriangle,
  Bell,
  X
} from 'lucide-react';

const App: React.FC = () => {
  // --- 1. USER & STATE MANAGEMENT ---
  const [currentUser, setCurrentUser] = useState<Employee | null>(() => {
    const saved = localStorage.getItem('universal_app_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.TASKS);
  const [isSyncing, setIsSyncing] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ title: string, message: string } | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<number>(Date.now());

  // --- OneSignal Notification Setup ---
  useNotificationSetup({
    userMobile: currentUser?.mobile || null,
    isLoggedIn: !!currentUser
  });

  // --- 2. UPDATED EMPLOYEES LIST (With Your Number) ---
  const DEFAULT_EMPLOYEES: Employee[] = [
    {
      id: 'emp-admin',
      name: 'Sanil Petkar', // Updated Name
      mobile: '8668678238', // Updated Number (Login with this + OTP 1234)
      role: 'manager',
      points: 0
    },
    { id: 'emp-staff-1', name: 'Staff Member 1', mobile: '8888888888', role: 'staff', points: 0 },
    { id: 'emp-staff-2', name: 'Staff Member 2', mobile: '7777777777', role: 'staff', points: 0 }
  ];

  const DEFAULT_TASKS = [
    {
      id: 'task-demo-1',
      description: 'Welcome to your new Universal Task App',
      status: 'pending' as TaskStatus,
      createdAt: Date.now(),
      assignedBy: 'emp-admin',
      assignedTo: 'emp-staff-1'
    }
  ];

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rewardConfig, setRewardConfig] = useState<RewardConfig>({
    targetPoints: 100,
    rewardName: 'Bonus Day Off'
  });

  // Load data logic
  const loadInitialData = async (isSilent: boolean = false) => {
    try {
      if (!isSilent) {
        setLoading(true);
      }
      setLoadError(null);

      // Fetch employees from Supabase
      const { data: employeesData, error: employeesError } = await supabase
        .from('employees')
        .select('*');

      // Fetch tasks from Supabase with role-based filtering
      let tasksQuery = supabase.from('tasks').select('*');
      
      // Apply role-based filtering using currentUser from state
      if (employeesData && employeesData.length > 0 && currentUser) {
        // Filter for managers and staff: only their assigned or created tasks
        // Database uses camelCase: assignedTo, assignedBy
        tasksQuery = tasksQuery.or(`assignedTo.eq.${currentUser.id},assignedBy.eq.${currentUser.id}`);
      }
      // For super_admin, keep fetching all tasks (no filtering)
      
      const result = await tasksQuery;
      const { data: tasksData, error: tasksError } = result;

      // Check if we have valid data or if there were errors
      // If errors or empty data, use defaults
      const finalEmployees = (employeesData && employeesData.length > 0)
        ? employeesData
        : DEFAULT_EMPLOYEES;

      const finalTasks = (tasksData && tasksData.length > 0)
        ? tasksData
        : DEFAULT_TASKS;

      if (employeesError || tasksError) {
        console.warn('⚠️ using fallback data due to Supabase error');
        if (employeesError) console.warn('Employees error:', employeesError);
        if (tasksError) console.warn('Tasks error:', tasksError);
      }

      return {
        employees: finalEmployees,
        tasks: finalTasks
      };
    } catch (error) {
      console.error('🚨 Supabase Connection Failed - Using Fallback Data');
      // FALLBACK TO DEFAULT DATA instead of showing error screen
      return {
        employees: DEFAULT_EMPLOYEES,
        tasks: DEFAULT_TASKS
      };
    } finally {
      setLoading(false);
    }
  };

  const [tasks, setTasks] = useState<DealershipTask[]>([]);

  // Ref for fetchTasks to prevent infinite loop
  const fetchTasksRef = useRef(null);

  // Extract fetchTasks logic as useCallback to prevent stale closures
  const fetchTasks = useCallback(async () => {
    try {
      console.log('🔄 Fetching tasks...');
      
      // Fetch employees from Supabase
      const { data: employeesData, error: employeesError } = await supabase
        .from('employees')
        .select('*');

      // Fetch tasks from Supabase with role-based filtering
      let tasksQuery = supabase.from('tasks').select('*');
      
      // Apply role-based filtering using currentUser from state
      if (employeesData && employeesData.length > 0 && currentUser) {
        // Filter for managers and staff: only their assigned or created tasks
        // Database uses camelCase: assignedTo, assignedBy
        tasksQuery = tasksQuery.or(`assignedTo.eq.${currentUser.id},assignedBy.eq.${currentUser.id}`);
      }
      // For super_admin, keep fetching all tasks (no filtering)
      
      const result = await tasksQuery;
      const { data: tasksData, error: tasksError } = result;
      
      if (tasksError) {
        console.error('❌ Failed to fetch tasks:', tasksError);
      } else {
        console.log('✅ Successfully fetched tasks:', tasksData);
        setTasks(tasksData || []);
      }
    } catch (err) {
      console.error('🚨 Unexpected error fetching tasks:', err);
    }
  }, [fetchTasksRef]); // Add fetchTasks to dependencies

  // Keep ref updated with latest fetchTasks function
  useEffect(() => {
    fetchTasksRef.current = fetchTasks;
  }, [fetchTasks]);

  // --- ROBUST SYNCHRONIZATION EFFECT ---
  useEffect(() => {
    // Initial Load
    loadInitialData(false).then(data => {
      if (data) {
        setEmployees(data.employees);
        setTasks(data.tasks);
      }
    });
  }, []);

  // --- REALTIME SUBSCRIPTION FOR TASKS ---
  useEffect(() => {
    const taskListener = supabase
      .channel('public:tasks')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks' }, async (payload) => {
        console.log('🔔 Realtime INSERT:', payload);
        try {
          // Fetch complete task with joined employee data
          const { data: fullTask, error } = await supabase
            .from('tasks')
            .select('*, assigned_to_user:employees!assigned_to(*), assigned_by_user:employees!assigned_by(*)')
            .eq('id', payload.new.id)
            .single();
          
          if (error) {
            console.error('❌ Failed to fetch full task for INSERT:', error);
            return;
          }
          
          if (fullTask) {
            setTasks(prev => [fullTask, ...prev]);
          }
        } catch (err) {
          console.error('🚨 Error in realtime INSERT handler:', err);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks' }, async (payload) => {
        console.log('🔔 Realtime UPDATE:', payload);
        try {
          // Fetch complete task with joined employee data
          const { data: fullTask, error } = await supabase
            .from('tasks')
            .select('*, assigned_to_user:employees!assigned_to(*), assigned_by_user:employees!assigned_by(*)')
            .eq('id', payload.new.id)
            .single();
          
          if (error) {
            console.error('❌ Failed to fetch full task for UPDATE:', error);
            return;
          }
          
          if (fullTask) {
            setTasks(prev => prev.map(task => task.id === fullTask.id ? fullTask : task));
          }
        } catch (err) {
          console.error('🚨 Error in realtime UPDATE handler:', err);
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tasks' }, (payload) => {
        console.log('🔔 Realtime DELETE:', payload);
        const deletedTaskId = payload.old.id;
        setTasks(prev => prev.filter(task => task.id !== deletedTaskId));
      })
      .subscribe();

    // Cleanup subscription when component unmounts
    return () => {
      taskListener.unsubscribe();
    };
  }, []);

  // --- APP RESUME LISTENERS FOR TASK SYNC ---
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('📱 App became visible, refreshing tasks...');
        loadInitialData(false).then(data => {
          if (data) {
            setEmployees(data.employees);
            setTasks(data.tasks);
          }
        });
      }
    };

    const handleFocus = () => {
      console.log('🎯 App gained focus, refreshing tasks...');
      loadInitialData(false).then(data => {
        if (data) {
          setEmployees(data.employees);
          setTasks(data.tasks);
        }
      });
    };

    // Add event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    // Cleanup event listeners when component unmounts
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // --- 3. EFFECTS (Notifications & Auto-Save) ---

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    setAppReady(true);
  }, []);

  // Auto-Save Tasks
  useEffect(() => {
    if (appReady) {
      localStorage.setItem('universalAppTasks', JSON.stringify(tasks));
    }
  }, [tasks, appReady]);

  // Notifications Logic
  useEffect(() => {
    if (currentUser && tasks.length > 0) {
      const lastSeen = parseInt(localStorage.getItem(`last_seen_${currentUser.id}`)) || 0;
      const newTasks = tasks.filter(t => t.assignedTo === currentUser.id && t.createdAt > lastSeen && t.status === 'pending');
      
      if (newTasks.length > 0) {
        const lastTask = newTasks[0];
        setNotification({
          title: "New Assignment",
          message: `New task assigned: ${lastTask.description}`
        });
        // Update lastSeen timestamp to prevent duplicate notifications
        localStorage.setItem(`last_seen_${currentUser.id}`, Date.now().toString());
      }
    }
  }, [currentUser, appReady, tasks]);

  // --- 4. CORE ACTIONS (Add, Delete, Complete) ---

  const addTask = async (description: string, assignedTo?: string, parentTaskId?: string, deadline?: number, requirePhoto?: boolean) => {
    if (!currentUser) return;

    const newTask: DealershipTask = {
      id: `task-${Date.now()}`,
      description,
      status: 'pending',
      createdAt: Date.now(),
      deadline: deadline,
      requirePhoto: requirePhoto || false,
      assignedTo: assignedTo === 'none' ? undefined : assignedTo,
      assignedBy: currentUser.id,
      parentTaskId: parentTaskId
    };

    try {
      // Insert task into Supabase
      const { data, error } = await supabase
        .from('tasks')
        .insert([newTask]);

      if (error) {
        console.error('Error adding task:', error);
        // Fallback to local state
        setTasks(prev => [newTask, ...prev]);
      } else if (data) {
        // Update local state with the returned task (which may have DB-generated ID)
        setTasks(prev => [data[0], ...prev]);
      }
    } catch (error) {
      console.error('Error adding task:', error);
      // Fallback to local state
      setTasks(prev => [newTask, ...prev]);
    }
  };

  const startTask = async (taskId: string) => {
    try {
      // Update task status in Supabase
      const { error } = await supabase
        .from('tasks')
        .update({ status: 'in-progress' as TaskStatus })
        .eq('id', taskId);

      if (error) {
        console.error('Error starting task:', error);
        // Fallback to local state
        setTasks(prev => prev.map(t =>
          t.id === taskId
            ? { ...t, status: 'in-progress' as TaskStatus }
            : t
        ));
      } else {
        // Update local state
        setTasks(prev => prev.map(t =>
          t.id === taskId
            ? { ...t, status: 'in-progress' as TaskStatus }
            : t
        ));
      }
    } catch (error) {
      console.error('Error starting task:', error);
      // Fallback to local state
      setTasks(prev => prev.map(t =>
        t.id === taskId
          ? { ...t, status: 'in-progress' as TaskStatus }
          : t
      ));
    }
  };

  const reopenTask = async (taskId: string) => {
    try {
      // Update task status in Supabase
      const { error } = await supabase
        .from('tasks')
        .update({
          status: 'pending' as TaskStatus,
          completedAt: undefined,
          proof: undefined
        })
        .eq('id', taskId);

      if (error) {
        console.error('Error reopening task:', error);
        // Fallback to local state
        setTasks(prev => prev.map(t =>
          t.id === taskId
            ? { ...t, status: 'pending' as TaskStatus, completedAt: undefined, proof: undefined }
            : t
        ));
      } else {
        // Update local state
        setTasks(prev => prev.map(t =>
          t.id === taskId
            ? { ...t, status: 'pending' as TaskStatus, completedAt: undefined, proof: undefined }
            : t
        ));
      }
    } catch (error) {
      console.error('Error reopening task:', error);
      // Fallback to local state
      setTasks(prev => prev.map(t =>
        t.id === taskId
          ? { ...t, status: 'pending' as TaskStatus, completedAt: undefined, proof: undefined }
          : t
      ));
    }
  };

  const completeTask = async (taskId: string, proofData: { imageUrl: string, timestamp: number }) => {
    try {
      // Update task in Supabase
      const { error: taskError } = await supabase
        .from('tasks')
        .update({
          status: 'completed' as TaskStatus,
          completedAt: proofData.timestamp,
          proof: proofData
        })
        .eq('id', taskId);

      if (taskError) {
        console.error('Error completing task:', taskError);
        // Fallback to local state
        setTasks(prev => prev.map(t =>
          t.id === taskId
            ? { ...t, status: 'completed' as TaskStatus, completedAt: proofData.timestamp, proof: proofData }
            : t
        ));
      } else {
        // Update local state
        setTasks(prev => prev.map(t =>
          t.id === taskId
            ? { ...t, status: 'completed' as TaskStatus, completedAt: proofData.timestamp, proof: proofData }
            : t
        ));
      }

      // Add 10 points to the user who completed the task
      const task = tasks.find(t => t.id === taskId);
      if (task && task.assignedTo) {
        const employee = employees.find(emp => emp.id === task.assignedTo);
        if (employee) {
          const { error: pointsError } = await supabase
            .from('employees')
            .update({ points: employee.points + 10 })
            .eq('id', task.assignedTo);

          if (pointsError) {
            console.error('Error updating points:', pointsError);
            // Fallback to local state
            setEmployees(prev => prev.map(emp =>
              emp.id === task.assignedTo
                ? { ...emp, points: emp.points + 10 }
                : emp
            ));
          } else {
            // Update local state
            setEmployees(prev => prev.map(emp =>
              emp.id === task.assignedTo
                ? { ...emp, points: emp.points + 10 }
                : emp
            ));
          }
        }
      }
    } catch (error) {
      console.error('Error completing task:', error);
      // Fallback to local state
      setTasks(prev => prev.map(t =>
        t.id === taskId
          ? { ...t, status: 'completed' as TaskStatus, completedAt: proofData.timestamp, proof: proofData }
          : t
      ));
    }
  };

  const completeTaskWithoutPhoto = async (taskId: string) => {
    try {
      // Update task in Supabase
      const { error: taskError } = await supabase
        .from('tasks')
        .update({ status: 'completed' as TaskStatus, completedAt: Date.now() })
        .eq('id', taskId);
      
      const { error } = taskError;

      if (error) {
        console.error('Error completing task:', error);
        // Fallback to local state
        setTasks(prev => prev.map(t =>
          t.id === taskId
            ? { ...t, status: 'completed' as TaskStatus, completedAt: Date.now() }
            : t
        ));
      } else {
        // Update local state
        setTasks(prev => prev.map(t =>
          t.id === taskId
            ? { ...t, status: 'completed' as TaskStatus, completedAt: Date.now() }
            : t
        ));
      }

      // Add 10 points to the user who completed the task
      const task = tasks.find(t => t.id === taskId);
      if (task && task.assignedTo) {
        const employee = employees.find(emp => emp.id === task.assignedTo);
        if (employee) {
          const { error: pointsError } = await supabase
            .from('employees')
            .update({ points: employee.points + 10 })
            .eq('id', task.assignedTo);

          if (pointsError) {
            console.error('Error updating points:', pointsError);
            // Fallback to local state
            setEmployees(prev => prev.map(emp =>
              emp.id === task.assignedTo
                ? { ...emp, points: emp.points + 10 }
                : emp
            ));
          } else {
            // Update local state
            setEmployees(prev => prev.map(emp =>
              emp.id === task.assignedTo
                ? { ...emp, points: emp.points + 10 }
                : emp
            ));
          }
        }
      }
    } catch (error) {
      console.error('Error completing task:', error);
      // Fallback to local state
      setTasks(prev => prev.map(t =>
        t.id === taskId
          ? { ...t, status: 'completed' as TaskStatus, completedAt: Date.now() }
          : t
      ));
    }
  };

  const reassignTask = async (taskId: string, newAssigneeId: string) => {
    try {
      // Update task assignment in Supabase
      const { error } = await supabase
        .from('tasks')
        .update({ assignedTo: newAssigneeId })
        .eq('id', taskId);

      if (error) {
        console.error('Error reassigning task:', error);
        // Fallback to local state
        setTasks(prev => prev.map(t =>
          t.id === taskId ? { ...t, assignedTo: newAssigneeId } : t
        ));
      } else {
        // Update local state
        setTasks(prev => prev.map(t =>
          t.id === taskId ? { ...t, assignedTo: newAssigneeId } : t
        ));
      }
    } catch (error) {
      console.error('Error reassigning task:', error);
      // Fallback to local state
      setTasks(prev => prev.map(t =>
        t.id === taskId ? { ...t, assignedTo: newAssigneeId } : t
      ));
    }
  };

  const deleteTask = async (taskId: string) => {
    try {
      // Delete task from Supabase
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId);
      
      if (error) {
        console.error('Error deleting task:', error);
        // Fallback to local state
        const subTasks = tasks.filter(t => t.parentTaskId === taskId);
        setTasks(prev => prev.filter(t =>
          t.id !== taskId && !subTasks.some(st => st.id === t.id)
        ));
      } else {
        // Update local state
        const subTasks = tasks.filter(t => t.parentTaskId === taskId);
        setTasks(prev => prev.filter(t =>
          t.id !== taskId && !subTasks.some(st => st.id === t.id)
        ));
      }
    } catch (error) {
      console.error('Error deleting task:', error);
      // Fallback to local state
      const subTasks = tasks.filter(t => t.parentTaskId === taskId);
      setTasks(prev => prev.filter(t =>
        t.id !== taskId && !subTasks.some(st => st.id === t.id)
      ));
    }
  };

  const addEmployee = async (name: string, mobile: string, role: UserRole = 'staff') => {
    const newEmployee = { id: `emp-${Date.now()}`, name, mobile, role, points: 0 };
    
    console.log('📝 Adding employee:', newEmployee);
    
    // Add to local state IMMEDIATELY for instant UI feedback
    setEmployees(prev => [...prev, newEmployee]);
    console.log('✅ Employee added to local state immediately');

    try {
      // Insert employee into Supabase
      const { data, error } = await supabase
        .from('employees')
        .insert([newEmployee]);
      
      if (error) {
        console.error('❌ Error adding employee to database:', error);
        alert(`Database Error: ${error.message}. Employee added locally.`);
      } else if (data && data.length > 0) {
        console.log('✅ Employee synced with database:', data[0]);
        // Update local state with the DB version (may have different ID)
        setEmployees(prev => prev.map(e => e.id === newEmployee.id ? data[0] : e));
      }
    } catch (error) {
      console.error('🚨 Unexpected error adding employee:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}. Employee added locally.`);
    }
  };

  const removeEmployee = async (id: string) => {
    console.log('🗑️ Removing employee:', id);
    
    // Remove from local state IMMEDIATELY for instant UI feedback
    setEmployees(prev => prev.filter(e => e.id !== id));
    console.log('✅ Employee removed from local state immediately');
    
    try {
      // Delete employee from Supabase
      const { error } = await supabase
        .from('employees')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('❌ Error removing employee from database:', error);
        alert(`Database Error: ${error.message}. Employee removed locally.`);
      } else {
        console.log('✅ Employee removed from database successfully');
      }
    } catch (error) {
      console.error('🚨 Unexpected error removing employee:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}. Employee removed locally.`);
    }
  };

  const handleLogin = async (user: Employee) => {
    try {
      // Query employee from Supabase to get latest data
      const { data: employeeData, error } = await supabase
        .from('employees')
        .select('*')
        .eq('mobile', user.mobile)
        .single();

      if (error) {
        console.error('Error fetching employee data:', error);
        // Fallback to provided user data
        setCurrentUser(user);
        localStorage.setItem('universal_app_user', JSON.stringify(user));
      } else if (employeeData) {
        setCurrentUser(employeeData);
        localStorage.setItem('universal_app_user', JSON.stringify(employeeData));
      } else {
        console.error('Employee not found in database');
        setCurrentUser(user);
        localStorage.setItem('universal_app_user', JSON.stringify(user));
      }

      setActiveTab(AppTab.TASKS);
    } catch (error) {
      console.error('Login error:', error);
      // Fallback to provided user data
      setCurrentUser(user);
      localStorage.setItem('universal_app_user', JSON.stringify(user));
      setActiveTab(AppTab.TASKS);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('universal_app_user');
  };

  // --- 5. RENDER UI ---

  if (!appReady) {
    return (
      <div className="h-screen bg-[#0F172A] flex flex-col items-center justify-center text-white p-8">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
        <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">Starting App...</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col h-screen max-w-md mx-auto bg-[#0F172A] items-center justify-center p-8 relative overflow-hidden font-sans">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-white text-lg font-semibold">Loading data...</p>
          <p className="text-slate-400 text-sm mt-2">Please wait while we connect to the database</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col h-screen max-w-md mx-auto bg-red-600 items-center justify-center p-8 relative overflow-hidden font-sans">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-white mx-auto mb-6" />
          <h1 className="text-white text-2xl font-bold mb-4">Database Connection Error</h1>
          <div className="bg-red-800 rounded-lg p-4 mb-4 text-left">
            <p className="text-red-100 text-sm font-mono break-all">{loadError}</p>
          </div>
          <p className="text-red-100 text-sm">Please check your internet connection and try again.</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 bg-white text-red-600 px-6 py-3 rounded-lg font-semibold hover:bg-red-50 transition-colors"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    // Passing the updated employees list to LoginScreen
    return <LoginScreen employees={employees} onLogin={handleLogin} />;
  }

  const isManager = currentUser.role === 'manager' || currentUser.role === 'super_admin';

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-slate-50 relative overflow-hidden font-sans">

      {/* Notification Banner */}
      {notification && (
        <div className="fixed top-2 left-2 right-2 max-w-md mx-auto z-[100] animate-in slide-in-from-top-4 duration-500">
          <div className="bg-[#0F172A] text-white p-4 rounded-2xl shadow-2xl border border-blue-500/30 flex items-center gap-4">
            <div className="bg-blue-600 p-2 rounded-xl">
              <Bell className="w-5 h-5 animate-bounce" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-400">{notification.title}</p>
              <p className="text-sm font-bold truncate">{notification.message}</p>
            </div>
            <button onClick={() => setNotification(null)} className="p-1 hover:bg-white/10 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-[#0F172A] text-white p-5 sticky top-0 z-30 flex items-center justify-between shadow-2xl border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-1.5 rounded-lg shadow-lg shadow-blue-500/20">
            <LayoutDashboard className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tighter italic leading-none">Universal Tasker</h1>
            <div className="flex items-center gap-1.5 mt-1">
              <div className={`w-1.5 h-1.5 rounded-full ${isSyncing ? 'bg-blue-500 animate-pulse' : 'bg-emerald-500'}`} />
              <span className="text-[7px] font-black uppercase tracking-widest text-slate-400">
                {isSyncing ? 'Syncing...' : 'Online'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-[10px] font-black leading-none">{currentUser.name}</p>
            <p className="text-[8px] text-blue-400 uppercase font-black tracking-widest mt-0.5">{currentUser.role}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2.5 bg-slate-800/50 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-all border border-white/5"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-24 px-4 pt-4">
        {activeTab === AppTab.DASHBOARD && (
          <StatsScreen
            tasks={tasks}
            currentUser={currentUser}
            employees={employees}
            rewardConfig={rewardConfig}
          />
        )}

        {activeTab === AppTab.TASKS && (
          <Dashboard
            tasks={tasks}
            employees={employees}
            currentUser={currentUser}
            onAddTask={addTask}
            onStartTask={startTask}
            onReopenTask={reopenTask}
            onCompleteTask={completeTask}
            onCompleteTaskWithoutPhoto={completeTaskWithoutPhoto}
            onReassignTask={reassignTask}
            onDeleteTask={deleteTask}
          />
        )}

        {isManager && activeTab === AppTab.TEAM && (
          <TeamManager
            employees={employees}
            onAddEmployee={addEmployee}
            onRemoveEmployee={removeEmployee}
            rewardConfig={rewardConfig}
            onUpdateRewardConfig={setRewardConfig}
          />
        )}
      </main>

      {/* Simplified Bottom Nav (Dashboard, Tasks, Team) */}
      <nav className="bg-white border-t border-slate-200 fixed bottom-0 left-0 right-0 max-w-md mx-auto z-40 safe-bottom shadow-[0_-10px_40px_rgba(15,23,42,0.1)] rounded-t-[2.5rem]">
        <div className="flex justify-around items-center h-20 px-2">

          <NavBtn
            active={activeTab === AppTab.DASHBOARD}
            onClick={() => setActiveTab(AppTab.DASHBOARD)}
            icon={<LayoutDashboard className="w-6 h-6" />}
            label="Dashboard"
          />

          <NavBtn
            active={activeTab === AppTab.TASKS}
            onClick={() => setActiveTab(AppTab.TASKS)}
            icon={<ClipboardList className="w-6 h-6" />}
            label="Tasks"
          />

          {isManager && (
            <NavBtn
              active={activeTab === AppTab.TEAM}
              onClick={() => setActiveTab(AppTab.TEAM)}
              icon={<Users className="w-6 h-6" />}
              label="Team"
            />
          )}

        </div>
      </nav>
    </div>
  );
};

const NavBtn = ({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: any, label: string }) => (
  <button onClick={onClick} className={`flex-1 flex flex-col items-center gap-1.5 transition-all min-w-[70px] ${active ? 'text-blue-600' : 'text-slate-400'}`}>
    <div className={`p-2.5 rounded-[1.2rem] transition-all duration-500 ${active ? 'bg-blue-50 scale-110 shadow-inner ring-4 ring-blue-500/5' : ''}`}>{icon}</div>
    <span className={`text-[8px] font-black uppercase tracking-[0.15em] ${active ? 'opacity-100' : 'opacity-40'}`}>{label}</span>
  </button>
);

export default App;
