import React, { useState } from 'react';
import { DealershipTask, Employee } from '../types';
import TaskItem from './TaskItem-demo';
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
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [assigneeId, setAssigneeId] = useState('none');
  const [deadline, setDeadline] = useState('');
  const [requirePhoto, setRequirePhoto] = useState(false);
  const [selectedPersonFilter, setSelectedPersonFilter] = useState('ALL');
  
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [delegatingTaskId, setDelegatingTaskId] = useState<string | null>(null);
  const [reassigningTaskId, setReassigningTaskId] = useState<string | null>(null);

  // Filter tasks based on view and person filter
  const filteredTasks = tasks.filter(task => {
    const statusMatch = task.status === view;
    const personMatch = selectedPersonFilter === 'ALL' || 
                      (selectedPersonFilter === 'UNASSIGNED' && !task.assignedTo) ||
                      (selectedPersonFilter !== 'UNASSIGNED' && task.assignedTo === selectedPersonFilter);
    return statusMatch && personMatch;
  });

  const handleAddTask = () => {
    if (!newTaskDesc.trim()) return;
    
    const deadlineTimestamp = deadline ? new Date(deadline).getTime() : undefined;
    onAddTask(newTaskDesc, assigneeId === 'none' ? undefined : assigneeId, undefined, deadlineTimestamp, requirePhoto);
    
    setNewTaskDesc('');
    setAssigneeId('none');
    setDeadline('');
    setRequirePhoto(false);
  };

  const isManager = currentUser.role === 'manager';
  const staffEmployees = employees.filter(emp => emp.role === 'staff');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ClipboardIcon className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-800">Task Management</h2>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Clock className="w-4 h-4" />
            <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex gap-2 mb-4">
          {(['pending', 'in-progress', 'completed'] as const).map(status => (
            <button
              key={status}
              onClick={() => setView(status)}
              className={`px-4 py-2 rounded-xl font-medium text-sm transition-all ${
                view === status
                  ? status === 'pending' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                    status === 'in-progress' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                    'bg-green-100 text-green-700 border border-green-200'
                  : 'bg-slate-100 text-slate-600 border border-slate-200'
              }`}
            >
              {status === 'pending' && '📋 Pending'}
              {status === 'in-progress' && '⚡ In Progress'}
              {status === 'completed' && '✅ Completed'}
            </button>
          ))}
        </div>

        {/* Person Filter */}
        <div className="flex items-center gap-2 mb-4">
          <User className="w-4 h-4 text-slate-500" />
          <select
            value={selectedPersonFilter}
            onChange={(e) => setSelectedPersonFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">All Staff</option>
            <option value="UNASSIGNED">Unassigned</option>
            {staffEmployees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>
        </div>

        {/* Add Task Form */}
        {isManager && (
          <div className="bg-slate-50 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-3">
              <Plus className="w-4 h-4 text-blue-600" />
              <h3 className="font-semibold text-slate-800">Create New Task</h3>
            </div>
            
            <input
              type="text"
              placeholder="Task description..."
              value={newTaskDesc}
              onChange={(e) => setNewTaskDesc(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddTask()}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            
            <div className="flex gap-2">
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="none">Unassigned</option>
                {staffEmployees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
              
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="requirePhoto"
                checked={requirePhoto}
                onChange={(e) => setRequirePhoto(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <label htmlFor="requirePhoto" className="text-sm text-slate-700 flex items-center gap-1">
                <Camera className="w-4 h-4" />
                Photo required
              </label>
            </div>
            
            <button
              onClick={handleAddTask}
              disabled={!newTaskDesc.trim()}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Add Task
            </button>
          </div>
        )}
      </div>

      {/* Task List */}
      <div className="space-y-3">
        {filteredTasks.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-200">
            <div className="text-slate-400 mb-2">
              {view === 'pending' && <ClipboardIcon className="w-12 h-12 mx-auto" />}
              {view === 'in-progress' && <Timer className="w-12 h-12 mx-auto" />}
              {view === 'completed' && <CheckCircle2 className="w-12 h-12 mx-auto" />}
            </div>
            <p className="text-slate-600 font-medium">
              {view === 'pending' && 'No pending tasks'}
              {view === 'in-progress' && 'No tasks in progress'}
              {view === 'completed' && 'No completed tasks'}
            </p>
            <p className="text-slate-400 text-sm mt-1">
              {selectedPersonFilter !== 'ALL' && `Filtered by: ${selectedPersonFilter === 'UNASSIGNED' ? 'Unassigned' : employees.find(e => e.id === selectedPersonFilter)?.name}`}
            </p>
          </div>
        ) : (
          filteredTasks.map(task => (
            <TaskItem
              key={task.id}
              task={task}
              employees={employees}
              currentUser={currentUser}
              assigneeName={employees.find(e => e.id === task.assignedTo)?.name}
              assignerName={employees.find(e => e.id === task.assignedBy)?.name}
              onStartTask={() => onStartTask(task.id)}
              onReopenTask={() => onReopenTask(task.id)}
              onCompleteTask={(proof) => onCompleteTask(task.id, proof)}
              onCompleteTaskWithoutPhoto={() => onCompleteTaskWithoutPhoto(task.id)}
              onDelegate={() => setDelegatingTaskId(task.id)}
              onReassign={() => setReassigningTaskId(task.id)}
              onDelete={() => onDeleteTask(task.id)}
            />
          ))
        )}
      </div>

      {/* Modals */}
      {completingTaskId && (
        <CompletionModal
          taskId={completingTaskId}
          task={tasks.find(t => t.id === completingTaskId)!}
          onClose={() => setCompletingTaskId(null)}
          onComplete={onCompleteTask}
          onCompleteWithoutPhoto={onCompleteTaskWithoutPhoto}
        />
      )}

      {delegatingTaskId && (
        <DelegationModal
          taskId={delegatingTaskId}
          employees={employees}
          onClose={() => setDelegatingTaskId(null)}
          onDelegate={(newAssigneeId) => {
            onReassignTask(delegatingTaskId, newAssigneeId);
            setDelegatingTaskId(null);
          }}
        />
      )}

      {reassigningTaskId && (
        <ReassignModal
          taskId={reassigningTaskId}
          employees={employees}
          onClose={() => setReassigningTaskId(null)}
          onReassign={(newAssigneeId) => {
            onReassignTask(reassigningTaskId, newAssigneeId);
            setReassigningTaskId(null);
          }}
        />
      )}
    </div>
  );
};

export default Dashboard;
