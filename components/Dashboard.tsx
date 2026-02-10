import React, { useState, useEffect } from 'react';
import { DealershipTask, Employee, UserRole, TaskStatus } from '../types';
import { supabase } from '../src/lib/supabase';
import { sendTaskAssignmentNotification, sendTaskCompletionNotification } from '../src/utils/pushNotifications';
import TaskItem from './TaskItem';
import CompletionModal from './CompletionModal';
import DelegationModal from './DelegationModal';
import ReassignModal from './ReassignModal';
import { Plus, Clock, CheckCircle2, UserPlus, ClipboardList as ClipboardIcon, CalendarClock, Timer, Camera, Bug, User, Edit, AlertTriangle, Calendar, Mic, MicOff } from 'lucide-react';

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
  const [deadlineView, setDeadlineView] = useState<'overdue' | 'today' | 'upcoming' | 'all'>('all');
  
  // Voice recognition state
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);
  
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
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  // Fetch employees directly from database for dropdown
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const result = await supabase
          .from('employees')
          .select('*');
        
        if (result.error) {
          console.error('❌ Dashboard: Failed to fetch employees:', result.error);
        } else {
          setDirectEmployees(result.data || []);
        }
      } catch (err) {
        console.error('🚨 Dashboard: Unexpected error fetching employees:', err);
      } finally {
        setIsLoadingEmployees(false);
      }
    };

    fetchEmployees();
  }, []);

  // Initialize voice recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      
      if (SpeechRecognition) {
        const recognitionInstance = new SpeechRecognition();
        recognitionInstance.continuous = false;
        recognitionInstance.interimResults = true;
        recognitionInstance.lang = 'en-US';

        recognitionInstance.onresult = (event: any) => {
          const transcript = Array.from(event.results)
            .map((result: any) => result[0])
            .map((result: any) => result.transcript)
            .join('');
          
          setNewTaskDesc(transcript);
        };

        recognitionInstance.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
          
          if (event.error === 'not-allowed') {
            alert('Microphone permission denied. Please allow microphone access to use voice input.');
          } else if (event.error === 'no-speech') {
            alert('No speech detected. Please try again.');
          } else {
            alert('Voice input error: ' + event.error);
          }
        };

        recognitionInstance.onend = () => {
          setIsListening(false);
        };

        setRecognition(recognitionInstance);
      } else {
        console.log('Speech recognition not supported');
      }
    }
  }, []);

  // Voice input handlers
  const startListening = () => {
    if (recognition && !isListening) {
      recognition.start();
      setIsListening(true);
    }
  };

  const stopListening = () => {
    if (recognition && isListening) {
      recognition.stop();
      setIsListening(false);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  // Dashboard uses tasks from props, not fetched independently

  const isManager = currentUser.role === 'manager'; // Only actual managers, not super_admin
  const isSuperAdmin = currentUser.role === 'super_admin';
  const canAssignTasks = currentUser.role === 'manager' || currentUser.role === 'super_admin'; // For UI permissions

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const deadlineTimestamp = deadline ? new Date(deadline).getTime() : undefined;
    
    if (!newTaskDesc.trim()) {
      console.log('❌ Empty task description, aborting');
      return;
    }
    
    try {
      if (editingTaskId) {
        // Update existing task
        console.log('🔧 Updating task...', {
          id: editingTaskId,
          description: newTaskDesc.trim(),
          assigneeId: assigneeId === 'none' ? null : assigneeId,
          requirePhoto: requirePhoto,
          deadline: deadlineTimestamp
        });
        
        const updateData = {
          description: newTaskDesc.trim(),
          assignedTo: assigneeId === 'none' ? null : assigneeId,
          deadline: deadlineTimestamp,
          requirePhoto: requirePhoto
        };
        
        const result = await supabase
          .from('tasks')
          .update(updateData)
          .eq('id', editingTaskId);
        
        if (result.error) {
          console.error('❌ Task update failed:', result.error);
          alert(`Task Update Error: ${result.error.message}`);
          return;
        }
        
        console.log('✅ Task updated successfully');
        setEditingTaskId(null);
        clearForm();
        
        // Trigger parent to refetch tasks
        setTimeout(() => {
          onAddTask('', '', '', '', false);
        }, 100);
      } else {
        // Create new task using parent's onAddTask function
        console.log('🔧 Creating task...', {
          description: newTaskDesc.trim(),
          assigneeId: assigneeId === 'none' ? null : assigneeId,
          requirePhoto: requirePhoto,
          deadline: deadlineTimestamp
        });
        
        onAddTask(
          newTaskDesc.trim(),
          assigneeId === 'none' ? undefined : assigneeId,
          undefined, // parentTaskId
          deadlineTimestamp,
          requirePhoto
        );
        
        console.log('✅ Task creation request sent');
        
        // IMMEDIATELY reset form states
        setNewTaskDesc('');
        setAssigneeId('none');
        setDeadline('');
        setRequirePhoto(false);
        
        // Send push notification to assigned user
        if (assigneeId !== 'none') {
          const assignedEmployee = employees.find(emp => emp.id === assigneeId);
          if (assignedEmployee) {
            await sendTaskAssignmentNotification(
              newTaskDesc.trim(),
              assignedEmployee.name,
              currentUser.name,
              assignedEmployee.id
            );
          }
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
      const result = await supabase
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
        }]);
      
      if (result.error) {
        console.error('❌ Delegated task creation failed:', result.error);
        alert(`Task Creation Error: ${result.error.message}`);
      } else {
        console.log('✅ Delegated task created successfully:', result.data);
        
        // Send push notification to assigned user
        if (result.data && result.data.length > 0) {
          const assignedEmployee = employees.find(emp => emp.id === targetAssigneeId);
          // setTasks(prev => [result.data[0], ...prev]);
        }
        
        // Auto-reset filter to show new task
        setSelectedPersonFilter('ALL');
      }
    } catch (err) {
      console.error('🚨 Unexpected error creating delegated task:', err);
      alert(`Unexpected Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDelegatingTaskId(null);
    }
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
      
      const result = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', taskId);
      
      if (result.error) {
        console.error('❌ Failed to update task status:', result.error);
        alert(`Status Update Error: ${result.error.message}`);
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
      const result = await supabase
        .from('tasks')
        .update({ 
          status: 'completed',
          completedAt: Date.now(),
          proof: { imageUrl: photoUrl, timestamp: Date.now() }
        })
        .eq('id', taskId);
      
      if (result.error) {
        console.error('❌ Failed to complete task with photo:', result.error);
        alert(`Photo Completion Error: ${result.error.message}`);
      } else {
        console.log('✅ Task completed with photo successfully');
        onCompleteTask(taskId, { imageUrl: photoUrl, timestamp: Date.now() });
      }
    } catch (err) {
      console.error('🚨 Unexpected error completing task with photo:', err);
      alert(`Unexpected Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Tasks are already filtered by role in App.tsx, no need to filter again here
  const pendingTasks = tasks.filter(t => t.status === 'pending');
  const inProgressTasks = tasks.filter(t => t.status === 'in-progress');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  // --- DEADLINE FILTERING LOGIC ---
  const getDeadlineFilteredTasks = (tasks: DealershipTask[]) => {
    if (deadlineView === 'all') return tasks;
    
    const now = Date.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999); // End of today
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(23, 59, 59, 999); // End of next 7 days

    const incompleteTasks = tasks.filter(t => t.status !== 'completed');

    switch (deadlineView) {
      case 'overdue':
        return incompleteTasks.filter(t => {
          if (!t.deadline) return false;
          const deadlineDate = new Date(t.deadline);
          deadlineDate.setHours(0, 0, 0, 0); // Ignore time for overdue check
          return deadlineDate < today;
        });
      
      case 'today':
        return incompleteTasks.filter(t => {
          if (!t.deadline) return false;
          const deadlineDate = new Date(t.deadline);
          return deadlineDate >= today && deadlineDate <= todayEnd;
        });
      
      case 'upcoming':
        return incompleteTasks.filter(t => {
          if (!t.deadline) return false;
          const deadlineDate = new Date(t.deadline);
          return deadlineDate > todayEnd && deadlineDate <= nextWeek;
        });
      
      default:
        return tasks;
    }
  };

  // Person Filter Logic
  // Get filter options based on user role
  const getFilterOptions = () => {
    if (isSuperAdmin) {
      // Super admin can filter by all managers
      return directEmployees
        .filter(emp => emp.role === 'manager')
        .map(emp => ({
          id: emp.id,
          name: emp.name,
          role: emp.role
        }));
    } else if (isManager) {
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

  // Edit task handler
  const handleEditTask = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      setNewTaskDesc(task.description);
      setAssigneeId(task.assignedTo || 'none');
      setDeadline(task.deadline ? new Date(task.deadline).toISOString().split('T')[0] : '');
      setRequirePhoto(task.requirePhoto || false);
      setEditingTaskId(taskId);
    }
  };

  // Add remark handler
  const handleAddRemark = async (taskId: string, remark: string) => {
    try {
      console.log('🔧 Adding remark to task:', taskId, remark);
      
      const newRemarkId = `remark_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newRemark = {
        id: newRemarkId,
        taskId: taskId,
        employeeId: currentUser.id,
        employeeName: currentUser.name,
        remark: remark,
        timestamp: Date.now()
      };
      
      // For now, we'll store remarks in the task's remarks array
      // In a production app, you might want to create a separate remarks table
      const task = tasks.find(t => t.id === taskId);
      if (task) {
        const updatedRemarks = [...(task.remarks || []), newRemark];
        
        const result = await supabase
          .from('tasks')
          .update({ remarks: updatedRemarks })
          .eq('id', taskId);
        
        if (result.error) {
          console.error('❌ Remark addition failed:', result.error);
          
          // Check if the error is about missing remarks column
          if (result.error.message.includes('remarks') && result.error.message.includes('column')) {
            alert('Database setup required: The remarks column needs to be added to the tasks table. Please contact your administrator to run the migration.');
            return;
          }
          
          alert(`Remark Error: ${result.error.message}`);
          return;
        }
        
        console.log('✅ Remark added successfully');
        
        // Trigger parent to refetch tasks
        setTimeout(() => {
          onAddTask('', '', '', '', false);
        }, 100);
      }
    } catch (err) {
      console.error('🚨 Unexpected error adding remark:', err);
      alert(`Unexpected Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const filterOptions = getFilterOptions();

  // Apply person filter to tasks
  const getFilteredTasks = (tasks: DealershipTask[]) => {
    if (selectedPersonFilter === 'ALL') {
      if (isSuperAdmin) {
        // Super admin sees all tasks when 'ALL' is selected
        return tasks;
      } else {
        // Managers/staff see only their relevant tasks
        return tasks.filter(task => task.assignedTo === currentUser.id || task.assignedBy === currentUser.id);
      }
    }
    
    if (isSuperAdmin) {
      // Super admin can filter by any manager
      return tasks.filter(task => task.assignedBy === selectedPersonFilter);
    } else if (isManager) {
      // Manager filters by assignee
      return tasks.filter(task => task.assignedTo === selectedPersonFilter);
    } else {
      // Staff filters by assigner (manager)
      return tasks.filter(task => task.assignedBy === selectedPersonFilter);
    }
  };

  const filteredPendingTasks = getDeadlineFilteredTasks(getFilteredTasks(pendingTasks));
  const filteredInProgressTasks = getDeadlineFilteredTasks(getFilteredTasks(inProgressTasks));
  const filteredCompletedTasks = getDeadlineFilteredTasks(getFilteredTasks(completedTasks));

  const tasksToShow = view === 'pending' ? filteredPendingTasks : view === 'in-progress' ? filteredInProgressTasks : filteredCompletedTasks;

  return (
    <div className="space-y-6">
      {canAssignTasks && (
        <section className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 animate-in fade-in slide-in-from-top-4">
          <h2 className="text-xs font-black text-slate-500 mb-3 uppercase tracking-widest flex items-center gap-2">
            {editingTaskId ? <Edit className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
            {editingTaskId ? 'Edit Operation' : 'Assign New Operation'}
          </h2>
          <form onSubmit={handleAddTask} className="space-y-3">
            <div className="relative">
              <input 
                type="text" 
                value={newTaskDesc}
                onChange={(e) => setNewTaskDesc(e.target.value)}
                placeholder="What needs to be done?"
                className={`w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-400 pr-12 ${
                  isListening ? 'ring-2 ring-red-500 border-red-300' : ''
                }`}
              />
              <button
                type="button"
                onClick={toggleListening}
                className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-all ${
                  isListening 
                    ? 'bg-red-500 text-white hover:bg-red-600 animate-pulse' 
                    : 'bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600'
                }`}
                title={isListening ? 'Stop recording' : 'Start voice input'}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            </div>
            
            {isListening && (
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                <span>Listening... Speak your task description</span>
              </div>
            )}
            
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
            
            <div className="flex gap-2">
            <button 
              type="submit"
              className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white py-3 rounded-lg font-bold active:scale-95 transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-indigo-100"
            >
              {editingTaskId ? <Edit className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
              {editingTaskId ? 'Update Task' : 'Assign Task'}
            </button>
            
            {editingTaskId && (
              <button 
                type="button"
                onClick={() => {
                  setEditingTaskId(null);
                  clearForm();
                }}
                className="px-6 bg-gray-500 text-white py-3 rounded-xl font-bold hover:bg-gray-600 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                Cancel
              </button>
            )}
          </div>
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

      {/* Deadline Filter Tabs */}
      <div className="flex gap-3 pb-4">
        <button 
          onClick={() => setDeadlineView('overdue')}
          className={`flex-1 relative overflow-hidden rounded-xl transition-all duration-300 transform hover:scale-105 ${
            deadlineView === 'overdue' 
              ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-200 ring-2 ring-red-200' 
              : 'bg-white text-slate-600 hover:bg-red-50 hover:text-red-600 border border-slate-200 hover:border-red-200 shadow-sm hover:shadow-md'
          }`}
        >
          <div className="flex items-center justify-center gap-2 py-3 px-2">
            <AlertTriangle className={`w-4 h-4 ${deadlineView === 'overdue' ? 'text-white' : 'text-red-500'}`} />
            <span className="text-xs font-bold uppercase tracking-wide">Overdue</span>
          </div>
          {deadlineView === 'overdue' && (
            <div className="absolute top-0 right-0 w-2 h-2 bg-white rounded-full m-1 animate-pulse"></div>
          )}
        </button>
        
        <button 
          onClick={() => setDeadlineView('today')}
          className={`flex-1 relative overflow-hidden rounded-xl transition-all duration-300 transform hover:scale-105 ${
            deadlineView === 'today' 
              ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-200 ring-2 ring-orange-200' 
              : 'bg-white text-slate-600 hover:bg-orange-50 hover:text-orange-600 border border-slate-200 hover:border-orange-200 shadow-sm hover:shadow-md'
          }`}
        >
          <div className="flex items-center justify-center gap-2 py-3 px-2">
            <Clock className={`w-4 h-4 ${deadlineView === 'today' ? 'text-white' : 'text-orange-500'}`} />
            <span className="text-xs font-bold uppercase tracking-wide">Today</span>
          </div>
          {deadlineView === 'today' && (
            <div className="absolute top-0 right-0 w-2 h-2 bg-white rounded-full m-1 animate-pulse"></div>
          )}
        </button>
        
        <button 
          onClick={() => setDeadlineView('upcoming')}
          className={`flex-1 relative overflow-hidden rounded-xl transition-all duration-300 transform hover:scale-105 ${
            deadlineView === 'upcoming' 
              ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-200 ring-2 ring-blue-200' 
              : 'bg-white text-slate-600 hover:bg-blue-50 hover:text-blue-600 border border-slate-200 hover:border-blue-200 shadow-sm hover:shadow-md'
          }`}
        >
          <div className="flex items-center justify-center gap-2 py-3 px-2">
            <Calendar className={`w-4 h-4 ${deadlineView === 'upcoming' ? 'text-white' : 'text-blue-500'}`} />
            <span className="text-xs font-bold uppercase tracking-wide">Upcoming</span>
          </div>
          {deadlineView === 'upcoming' && (
            <div className="absolute top-0 right-0 w-2 h-2 bg-white rounded-full m-1 animate-pulse"></div>
          )}
        </button>
        
        <button 
          onClick={() => setDeadlineView('all')}
          className={`flex-1 relative overflow-hidden rounded-xl transition-all duration-300 transform hover:scale-105 ${
            deadlineView === 'all' 
              ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg shadow-green-200 ring-2 ring-green-200' 
              : 'bg-white text-slate-600 hover:bg-green-50 hover:text-green-600 border border-slate-200 hover:border-green-200 shadow-sm hover:shadow-md'
          }`}
        >
          <div className="flex items-center justify-center gap-2 py-3 px-2">
            <CheckCircle2 className={`w-4 h-4 ${deadlineView === 'all' ? 'text-white' : 'text-green-500'}`} />
            <span className="text-xs font-bold uppercase tracking-wide">All</span>
          </div>
          {deadlineView === 'all' && (
            <div className="absolute top-0 right-0 w-2 h-2 bg-white rounded-full m-1 animate-pulse"></div>
          )}
        </button>
      </div>

      {/* View Tabs */}
      <div className="flex gap-2 pb-4">
        <button 
          onClick={() => setView('pending')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${view === 'pending' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
        >
          <ClipboardIcon className="w-4 h-4" />
          To Do ({filteredPendingTasks.length})
        </button>
        <button 
          onClick={() => setView('in-progress')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${view === 'in-progress' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
        >
          <Timer className="w-4 h-4" />
          In Progress ({filteredInProgressTasks.length})
        </button>
        <button 
          onClick={() => setView('completed')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${view === 'completed' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-500'}`}
        >
          <CheckCircle2 className="w-4 h-4" />
          Done ({filteredCompletedTasks.length})
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
            onDelete={() => onDeleteTask(task.id)}
            onDelegate={() => setDelegatingTaskId(task.id)}
            onEdit={() => handleEditTask(task.id)}
            onSubTaskComplete={(subTaskId) => updateTaskStatus(subTaskId, 'completed')}
            onAddRemark={(taskId: string, remark: string) => handleAddRemark(taskId, remark)}
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
