import React, { useState, useEffect } from 'react';
import { DealershipTask, Employee, UserRole, TaskStatus } from '../types';
import { supabase } from '../src/lib/supabase';
import { sendTaskAssignmentNotification, sendTaskCompletionNotification } from '../src/utils/pushNotifications';
import TaskItem from './TaskItem';
import CompletionModal from './CompletionModal';
import DelegationModal from './DelegationModal';
import ReassignModal from './ReassignModal';
import { Plus, Clock, CheckCircle2, UserPlus, ClipboardList as ClipboardIcon, CalendarClock, Timer, Camera, Bug, User } from 'lucide-react';

interface DashboardProps {
  tasks: DealershipTask[];
  employees: Employee[];
  currentUser: Employee;
  onAddTask: (desc: string, assignedTo?: string, parentTaskId?: string, deadline?: number, requirePhoto?: boolean) => void;
  onStartTask: (id: string) => void;
  onReopenTask: (id: string) => void;
  onCompleteTask: (id: string, proof: { imageUrl: string, timestamp: number }) => void;
  onCompleteTaskWithoutPhoto: (id: string) => void;
  onReassignTask: (taskId: string, newAssigneeId: string) => void;
  onDeleteTask: (id: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ tasks, employees, currentUser, onAddTask, onStartTask, onReopenTask, onCompleteTask, onCompleteTaskWithoutPhoto, onReassignTask, onDeleteTask }) => {
  const [view, setView] = useState<'pending' | 'in-progress' | 'completed'>('pending');
  
  // Form state with localStorage persistence
  const [newTaskDesc, setNewTaskDesc] = useState(() => {
    return localStorage.getItem('task_form_desc') || '';
  });
  const [assigneeId, setAssigneeId] = useState(() => {
    return localStorage.getItem('task_form_assignee') || 'none';
  });
  const [deadline, setDeadline] = useState(() => {
    return localStorage.getItem('task_form_deadline') || '';
  });
  const [requirePhoto, setRequirePhoto] = useState(() => {
    return localStorage.getItem('task_form_photo') === 'true';
  });
  
  // Persist form state to localStorage
  useEffect(() => {
    localStorage.setItem('task_form_desc', newTaskDesc);
  }, [newTaskDesc]);
  
  useEffect(() => {
    localStorage.setItem('task_form_assignee', assigneeId);
  }, [assigneeId]);
  
  useEffect(() => {
    localStorage.setItem('task_form_deadline', deadline);
  }, [deadline]);
  
  useEffect(() => {
    localStorage.setItem('task_form_photo', String(requirePhoto));
  }, [requirePhoto]);
  
  const clearForm = () => {
    setNewTaskDesc('');
    setAssigneeId('none');
    setDeadline('');
    setRequirePhoto(false);
    localStorage.removeItem('task_form_desc');
    localStorage.removeItem('task_form_assignee');
    localStorage.removeItem('task_form_deadline');
    localStorage.removeItem('task_form_photo');
  };
  const [directEmployees, setDirectEmployees] = useState<Employee[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [selectedPersonFilter, setSelectedPersonFilter] = useState('ALL');
  
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [delegatingTaskId, setDelegatingTaskId] = useState<string | null>(null);
  const [reassigningTaskId, setReassigningTaskId] = useState<string | null>(null);

  // Fetch employees directly from database for dropdown
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        console.log('🔍 Dashboard: Fetching employees for dropdown...');
        const { data, error } = await supabase
          .from('employees')
          .select('*');
        
        if (error) {
          console.error('❌ Dashboard: Failed to fetch employees:', error);
        } else {
          console.log('✅ Dashboard: Successfully fetched employees:', data);
          setDirectEmployees(data || []);
        }
      } catch (err) {
        console.error('🚨 Dashboard: Unexpected error fetching employees:', err);
      } finally {
        setIsLoadingEmployees(false);
      }
    };

    fetchEmployees();
  }, []);

  // Fetch tasks directly from database
  useEffect(() => {
    const fetchTasks = async () => {
      try {
        console.log('🔍 Dashboard: Fetching all tasks from database...');
        const { data, error } = await supabase
          .from('tasks')
          .select('*');
        
        if (error) {
          console.error('❌ Dashboard: Failed to fetch tasks:', error);
        } else {
          console.log('✅ Dashboard: Successfully fetched tasks:', data);
          // setTasks(data || []);
        }
      } catch (err) {
        console.error('🚨 Dashboard: Unexpected error fetching tasks:', err);
      } finally {
        // setIsLoadingTasks(false);
      }
    };

    fetchTasks();
  }, []);

  const isManager = currentUser.role === 'manager' || currentUser.role === 'super_admin';

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const deadlineTimestamp = deadline ? new Date(deadline).getTime() : undefined;
    
    console.log('🔧 Creating task...', {
      description: newTaskDesc.trim(),
      assigneeId: assigneeId === 'none' ? null : assigneeId,
      requirePhoto: requirePhoto,
      deadline: deadlineTimestamp
    });
    
    if (!newTaskDesc.trim()) {
      console.log('❌ Empty task description, aborting');
      return;
    }
    
    try {
      console.log('🔧 Creating new task...');
      const newTaskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newTask = {
        id: newTaskId,
        description: newTaskDesc.trim(),
        assignedTo: assigneeId === 'none' ? null : assigneeId,
        status: 'pending',
        assignedBy: currentUser.id,
        deadline: deadlineTimestamp,
        requirePhoto: requirePhoto,
        createdAt: Date.now()
      };
      
      console.log('🔧 Inserting task into database:', newTask);
      const { data, error } = await supabase
        .from('tasks')
        .insert([newTask])
        .select();
      
      if (error) {
        console.error('❌ Task creation failed:', error);
        alert(`Task Creation Error: ${error.message}`);
      } else {
        console.log('✅ Task created successfully:', data);
        
        // Send push notification to assigned user
        if (data && data.length > 0 && assigneeId !== 'none') {
          const assignedEmployee = employees.find(emp => emp.id === assigneeId);
          if (assignedEmployee) {
            await sendTaskAssignmentNotification(
              data[0].description,
              assignedEmployee.name,
              currentUser.name,
              assignedEmployee.mobile
            );
          }
        }
        
        // Update local state immediately
        if (data && data.length > 0) {
          // setTasks(prev => [data[0], ...prev]);
        }
        
        // Auto-reset filter to show new task
        setSelectedPersonFilter('ALL');
        
        // Reset form and clear localStorage
        clearForm();
      }
    } catch (err) {
      console.error('🚨 Unexpected error creating task:', err);
      alert(`Unexpected Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleDelegate = async (parentTaskId: string, desc: string, targetAssigneeId: string, deadlineTimestamp?: number) => {
    try {
      console.log('🔧 Creating delegated task...');
      const newTaskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const { data, error } = await supabase
        .from('tasks')
        .insert([{
          id: newTaskId,
          description: desc,
          assignedTo: targetAssigneeId,
          status: 'pending',
          assignedBy: currentUser.id,
          parentTaskId: parentTaskId,
          deadline: deadlineTimestamp,
          createdAt: Date.now()
        }])
        .select();
      
      if (error) {
        console.error('❌ Delegated task creation failed:', error);
        alert(`Task Creation Error: ${error.message}`);
      } else {
        console.log('✅ Delegated task created successfully:', data);
        
        // Send push notification to assigned user
        if (data && data.length > 0) {
          const assignedEmployee = employees.find(emp => emp.id === targetAssigneeId);
          if (assignedEmployee) {
            await sendTaskAssignmentNotification(
              data[0].description,
              assignedEmployee.name,
              currentUser.name,
              assignedEmployee.mobile
            );
          }
        }
        
        // Update local state immediately
        if (data && data.length > 0) {
          // setTasks(prev => [data[0], ...prev]);
        }
        
        // Auto-reset filter to show new task
        setSelectedPersonFilter('ALL');
      }
    } catch (err) {
      console.error('🚨 Unexpected error creating delegated task:', err);
      alert(`Unexpected Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    
    setDelegatingTaskId(null);
  };

  const handleReassign = async (taskId: string, newAssigneeId: string) => {
    await onReassignTask(taskId, newAssigneeId);
    setReassigningTaskId(null);
  };

  // Update task status in database and local state
  const updateTaskStatus = async (taskId: string, newStatus: 'pending' | 'in-progress' | 'completed', proofUrl?: string) => {
    try {
      console.log(`🔄 Updating task ${taskId} to status: ${newStatus}`, proofUrl ? `with proof: ${proofUrl}` : '');
      
      const updateData: any = { status: newStatus };
      if (proofUrl) {
        updateData.proof = { imageUrl: proofUrl, timestamp: Date.now() };
        updateData.completedAt = Date.now();
      }
      
      const { error } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', taskId);
      
      if (error) {
        console.error('❌ Failed to update task status:', error);
        alert(`Status Update Error: ${error.message}`);
      } else {
        console.log('✅ Task status updated successfully');
        
        // Award points for completed tasks
        if (newStatus === 'completed') {
          const completedTask = tasks.find(t => t.id === taskId);
          console.log('Task Object:', completedTask);
          
          const assigneeId = completedTask?.assignedTo;
          if (assigneeId) {
            console.log(`🏆 Awarding 10 points to user: ${assigneeId}`);
            
            const { error: pointsError } = await supabase.rpc('increment_points', { 
              user_id: assigneeId, 
              amount: 10 
            });
            
            if (pointsError) {
              console.error('❌ Failed to award points:', pointsError);
            } else {
              console.log('✅ Points awarded successfully');
              alert('Points awarded!');
              
              setDirectEmployees(prev => prev.map(emp => 
                emp.id === assigneeId 
                  ? { ...emp, points: (emp.points || 0) + 10 }
                  : emp
              ));
              
              // Send completion notification to task creator
              const taskCreator = employees.find(emp => emp.id === completedTask?.assignedBy);
              if (taskCreator) {
                await sendTaskCompletionNotification(
                  completedTask.description,
                  currentUser.name,
                  taskCreator.mobile
                );
              }
            }
          }
        }
        
        // Call parent handler to update global state
        if (newStatus === 'in-progress') {
          onStartTask(taskId);
        } else if (newStatus === 'completed') {
          if (proofUrl) {
            onCompleteTask(taskId, { imageUrl: proofUrl, timestamp: Date.now() });
          } else {
            onCompleteTaskWithoutPhoto(taskId);
          }
        } else if (newStatus === 'pending') {
          onReopenTask(taskId);
        }
      }
    } catch (err) {
      console.error('🚨 Unexpected error updating task:', err);
      alert(`Unexpected Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Complete task with photo proof
  const completeTaskWithPhoto = async (taskId: string, photoUrl: string) => {
    try {
      console.log(`📸 Completing task ${taskId} with photo proof:`, photoUrl);
      const { error } = await supabase
        .from('tasks')
        .update({ 
          status: 'completed',
          completedAt: Date.now(),
          proof: { imageUrl: photoUrl, timestamp: Date.now() }
        })
        .eq('id', taskId);
      
      if (error) {
        console.error('❌ Failed to complete task with photo:', error);
        alert(`Photo Completion Error: ${error.message}`);
      } else {
        console.log('✅ Task completed with photo successfully');
        onCompleteTask(taskId, { imageUrl: photoUrl, timestamp: Date.now() });
      }
    } catch (err) {
      console.error('🚨 Unexpected error completing task with photo:', err);
      alert(`Unexpected Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Delete task from database and local state
  const deleteTask = async (taskId: string) => {
    try {
      console.log(`🗑️ Deleting task ${taskId}`);
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId);
      
      if (error) {
        console.error('❌ Failed to delete task:', error);
        alert(`Delete Error: ${error.message}`);
      } else {
        console.log('✅ Task deleted successfully');
        // Call parent handler to update global state
        onDeleteTask(taskId);
      }
    } catch (err) {
      console.error('🚨 Unexpected error deleting task:', err);
      alert(`Unexpected Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  console.log("📋 Dashboard - Current User:", currentUser.name, currentUser.role);
  console.log("📋 Dashboard - Total tasks from database:", tasks.length);
  console.log("📋 Dashboard - All tasks detail:", tasks.map(t => ({ 
    id: t.id, 
    desc: t.description, 
    assignedTo: directEmployees.find(e => e.id === t.assignedTo)?.name || 'Unassigned',
    assignedBy: directEmployees.find(e => e.id === t.assignedBy)?.name || 'Unknown'
  })));

  // Filter tasks by visibility - only show user's own tasks unless super_admin
  const isSuperAdmin = currentUser.role === 'super_admin';
  const visibleTasks = isSuperAdmin 
    ? tasks 
    : tasks.filter(t => t.assignedTo === currentUser.id || t.assignedBy === currentUser.id);

  const pendingTasks = visibleTasks.filter(t => t.status === 'pending');
  const inProgressTasks = visibleTasks.filter(t => t.status === 'in-progress');
  const completedTasks = visibleTasks.filter(t => t.status === 'completed');

  // Person Filter Logic
  // Get filter options based on user role
  const getFilterOptions = () => {
    if (isManager) {
      // Managers can filter by assignees (employees)
      return directEmployees.map(emp => ({
        id: emp.id,
        name: emp.name,
        role: emp.role
      }));
    } else {
      // Staff can filter by managers (assigners)
      const uniqueManagers = tasks
        .filter(task => task.assignedBy)
        .map(task => task.assignedBy!)
        .filter((managerId, index, self) => self.indexOf(managerId) === index) // unique
        .map(managerId => directEmployees.find(emp => emp.id === managerId))
        .filter(emp => emp && emp.role === 'manager');
      
      return uniqueManagers as Employee[];
    }
  };

  const filterOptions = getFilterOptions();

  // Apply person filter to tasks
  const getFilteredTasks = (tasks: DealershipTask[]) => {
    if (selectedPersonFilter === 'ALL') {
      return tasks;
    }
    
    if (isManager) {
      // Manager filters by assignee
      return tasks.filter(task => task.assignedTo === selectedPersonFilter);
    } else {
      // Staff filters by assigner (manager)
      return tasks.filter(task => task.assignedBy === selectedPersonFilter);
    }
  };

  const filteredPendingTasks = getFilteredTasks(pendingTasks);
  const filteredInProgressTasks = getFilteredTasks(inProgressTasks);
  const filteredCompletedTasks = getFilteredTasks(completedTasks);

  const tasksToShow = view === 'pending' ? filteredPendingTasks : view === 'in-progress' ? filteredInProgressTasks : filteredCompletedTasks;

  return (
    <div className="space-y-6">
      {isManager && (
        <section className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 animate-in fade-in slide-in-from-top-4">
          <h2 className="text-xs font-black text-slate-500 mb-3 uppercase tracking-widest flex items-center gap-2">
            <Plus className="w-3 h-3" />
            Assign New Operation
          </h2>
          <form onSubmit={handleAddTask} className="space-y-3">
            <input 
              type="text" 
              value={newTaskDesc}
              onChange={(e) => setNewTaskDesc(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-400"
            />
            
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <select 
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none transition-all pr-10"
                >
                  <option value="none" className="text-slate-900">Anyone / Unassigned</option>
                  {isLoadingEmployees ? (
                    <option value="loading" className="text-slate-500">Loading staff...</option>
                  ) : (
                    directEmployees.map(emp => (
                      <option key={emp.id} value={emp.id} className="text-slate-900">
                        {emp.name} ({emp.role === 'manager' ? 'Manager' : 'Staff'})
                      </option>
                    ))
                  )}
                </select>
                <UserPlus className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              
              <div className="relative w-1/3 flex-shrink-0">
                <input 
                  type="datetime-local" 
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full border-2 rounded-xl px-3 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
                <CalendarClock className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                id="requirePhoto"
                checked={requirePhoto}
                onChange={(e) => setRequirePhoto(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-slate-300"
              />
              <label htmlFor="requirePhoto" className="text-sm text-slate-700">
                Require photo proof
              </label>
            </div>
            
            <button 
              type="submit"
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-100"
            >
              <Plus className="w-5 h-5" />
              Assign Task
            </button>
          </form>
        </section>
      )}

      {/* Person Filter */}
      <section className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-xs font-black text-slate-500 mb-3 uppercase tracking-widest flex items-center gap-2">
          <User className="w-3 h-3" />
          Person Filter
        </h2>
        <div className="relative">
          <select 
            value={selectedPersonFilter}
            onChange={(e) => setSelectedPersonFilter(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none transition-all pr-10"
          >
            <option value="ALL" className="text-slate-900">All Users</option>
            {filterOptions.map(person => (
              <option key={person.id} value={person.id} className="text-slate-900">
                {person.name} ({isManager ? 'Assignee' : 'Manager'})
              </option>
            ))}
          </select>
          <User className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
        <p className="text-slate-500 text-xs mt-2">
          {isManager ? 'Filter tasks by assigned staff member' : 'Filter tasks by manager who assigned them'}
        </p>
      </section>

      {/* View Tabs */}
      <div className="flex gap-2 pb-4">
        <button 
          onClick={() => setView('pending')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${view === 'pending' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
        >
          <ClipboardIcon className="w-4 h-4" />
          To Do ({pendingTasks.length})
        </button>
        <button 
          onClick={() => setView('in-progress')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${view === 'in-progress' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
        >
          <Timer className="w-4 h-4" />
          In Progress ({inProgressTasks.length})
        </button>
        <button 
          onClick={() => setView('completed')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${view === 'completed' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-500'}`}
        >
          <CheckCircle2 className="w-4 h-4" />
          Done ({completedTasks.length})
        </button>
      </div>

      {/* Task List */}
      <div className="space-y-3 pb-8 min-h-[500px]">
        {tasksToShow.map(task => (
          <TaskItem 
            key={task.id} 
            task={task} 
            subTasks={tasks.filter(t => t.parentTaskId === task.id)}
            parentTask={tasks.find(t => t.id === task.parentTaskId)}
            employees={directEmployees}
            currentUser={currentUser}
            onMarkComplete={() => updateTaskStatus(task.id, 'completed')}
            onCompleteWithPhoto={(photoUrl: string) => updateTaskStatus(task.id, 'completed', photoUrl)}
            onStartTask={() => updateTaskStatus(task.id, 'in-progress')}
            onReopenTask={() => updateTaskStatus(task.id, 'pending')}
            onCompleteTaskWithoutPhoto={() => updateTaskStatus(task.id, 'completed')}
            onReassign={() => setReassigningTaskId(task.id)}
            onDelete={() => deleteTask(task.id)}
            onDelegate={() => setDelegatingTaskId(task.id)}
            onSubTaskComplete={(subTaskId) => updateTaskStatus(subTaskId, 'completed')}
          />
        ))}
        {tasksToShow.length === 0 && (
          <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
            {view === 'pending' ? <Clock className="w-12 h-12 mx-auto mb-3 text-slate-200" /> : 
               view === 'in-progress' ? <Timer className="w-12 h-12 mx-auto mb-3 text-slate-200" /> :
               <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-slate-200" />}
            <p className="text-slate-400 font-bold">
              {view === 'pending' ? 'No pending tasks.' : 
                 view === 'in-progress' ? 'No tasks in progress.' : 
                 'No completions yet.'}
            </p>
          </div>
        )}
      </div>

      {completingTaskId && (
        <CompletionModal 
          onClose={() => setCompletingTaskId(null)}
          onConfirm={async (photo) => {
            await onCompleteTask(completingTaskId, { imageUrl: photo, timestamp: Date.now() });
            setCompletingTaskId(null);
          }}
        />
      )}

      {delegatingTaskId && (
        <DelegationModal 
          employees={employees}
          onClose={() => setDelegatingTaskId(null)}
          onConfirm={async (desc, targetId, deadline) => await handleDelegate(delegatingTaskId, desc, targetId, deadline)}
        />
      )}

      {reassigningTaskId && (
        <ReassignModal 
          employees={employees}
          currentAssignee={tasks.find(t => t.id === reassigningTaskId)?.assignedTo}
          onClose={() => setReassigningTaskId(null)}
          onConfirm={async (newAssigneeId) => await handleReassign(reassigningTaskId, newAssigneeId)}
        />
      )}
    </div>
  );
};

export default Dashboard;
