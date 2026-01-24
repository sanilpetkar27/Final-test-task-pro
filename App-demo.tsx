import React, { useState, useEffect } from 'react';
import { AppTab, DealershipTask, Employee, UserRole, TaskStatus, RewardConfig } from './types';
import Dashboard from './components/Dashboard-demo';
import StatsScreen from './components/StatsScreen';
import TeamManager from './components/TeamManager';
import LoginScreen from './components/LoginScreen';
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
  const [appReady, setAppReady] = useState(false);
  const [notification, setNotification] = useState<{ title: string, message: string } | null>(null);

  // --- 2. DEMO DATA ---
  const DEFAULT_EMPLOYEES: Employee[] = [
    {
      id: 'emp-admin',
      name: 'Sanil Petkar',
      mobile: '8668678238',
      role: 'manager',
      points: 0
    },
    { id: 'emp-staff-1', name: 'Staff Member 1', mobile: '8888888888', role: 'staff', points: 0 },
    { id: 'emp-staff-2', name: 'Staff Member 2', mobile: '7777777777', role: 'staff', points: 0 }
  ];

  const DEFAULT_TASKS = [
    {
      id: 'task-demo-1',
      description: 'Welcome to Universal Task App - Demo Mode',
      status: 'pending' as TaskStatus,
      createdAt: Date.now(),
      assignedBy: 'emp-admin',
      assignedTo: 'emp-staff-1'
    },
    {
      id: 'task-demo-2',
      description: 'Try creating a new task',
      status: 'pending' as TaskStatus,
      createdAt: Date.now() - 3600000,
      assignedBy: 'emp-admin',
      assignedTo: null
    }
  ];

  const [employees, setEmployees] = useState<Employee[]>(DEFAULT_EMPLOYEES);
  const [tasks, setTasks] = useState<DealershipTask[]>(DEFAULT_TASKS);
  const [rewardConfig, setRewardConfig] = useState<RewardConfig>({
    targetPoints: 100,
    rewardName: 'Bonus Day Off'
  });

  // --- 3. DEMO ACTIONS (No Supabase) ---
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

    setTasks(prev => [newTask, ...prev]);
  };

  const startTask = async (taskId: string) => {
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, status: 'in-progress' as TaskStatus }
        : t
    ));
  };

  const reopenTask = async (taskId: string) => {
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, status: 'pending' as TaskStatus, completedAt: undefined, proof: undefined }
        : t
    ));
  };

  const completeTask = async (taskId: string, proofData: { imageUrl: string, timestamp: number }) => {
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, status: 'completed' as TaskStatus, completedAt: proofData.timestamp, proof: proofData }
        : t
    ));

    // Add 10 points to the user who completed the task
    const task = tasks.find(t => t.id === taskId);
    if (task && task.assignedTo) {
      setEmployees(prev => prev.map(emp =>
        emp.id === task.assignedTo
          ? { ...emp, points: emp.points + 10 }
          : emp
      ));
    }
  };

  const completeTaskWithoutPhoto = async (taskId: string) => {
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, status: 'completed' as TaskStatus, completedAt: Date.now() }
        : t
    ));

    // Add 10 points to the user who completed the task
    const task = tasks.find(t => t.id === taskId);
    if (task && task.assignedTo) {
      setEmployees(prev => prev.map(emp =>
        emp.id === task.assignedTo
          ? { ...emp, points: emp.points + 10 }
          : emp
      ));
    }
  };

  const reassignTask = async (taskId: string, newAssigneeId: string) => {
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, assignedTo: newAssigneeId } : t
    ));
  };

  const deleteTask = async (taskId: string) => {
    const subTasks = tasks.filter(t => t.parentTaskId === taskId);
    setTasks(prev => prev.filter(t =>
      t.id !== taskId && !subTasks.some(st => st.id === t.id)
    ));
  };

  const addEmployee = async (name: string, mobile: string, role: UserRole = 'staff') => {
    const newEmployee = { id: `emp-${Date.now()}`, name, mobile, role, points: 0 };
    setEmployees(prev => [...prev, newEmployee]);
  };

  const removeEmployee = async (id: string) => {
    setEmployees(prev => prev.filter(e => e.id !== id));
  };

  const handleLogin = async (user: Employee) => {
    setCurrentUser(user);
    localStorage.setItem('universal_app_user', JSON.stringify(user));
    setActiveTab(AppTab.TASKS);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('universal_app_user');
  };

  // --- 4. EFFECTS ---
  useEffect(() => {
    setAppReady(true);
  }, []);

  // --- 5. RENDER UI ---
  if (!appReady) {
    return (
      <div className="h-screen bg-[#0F172A] flex flex-col items-center justify-center text-white p-8">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
        <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">Starting App...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginScreen employees={employees} onLogin={handleLogin} />;
  }

  const isManager = currentUser.role === 'manager';

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-slate-50 relative overflow-hidden font-sans">

      {/* Demo Banner */}
      <div className="bg-amber-500 text-white p-2 text-center text-xs font-bold">
        🎭 DEMO MODE - Data is not saved
      </div>

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
              <div className={`w-1.5 h-1.5 rounded-full bg-emerald-500`} />
              <span className="text-[7px] font-black uppercase tracking-widest text-slate-400">Demo</span>
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

      {/* Bottom Nav */}
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
