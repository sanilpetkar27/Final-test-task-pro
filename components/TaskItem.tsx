
import React, { useState } from 'react';
import { DealershipTask, Employee } from '../types';
import { Check, Camera, Maximize2, User, UserCheck, GitFork, ChevronDown, ChevronRight, Layers, Trash2, AlertTriangle, Clock, ArrowRight, Play, RotateCcw, CheckCircle } from 'lucide-react';
import { supabase } from '../src/lib/supabase';

interface TaskItemProps {
  task: DealershipTask;
  subTasks?: DealershipTask[];
  parentTask?: DealershipTask;
  employees: Employee[];
  currentUser: Employee;
  assigneeName?: string;
  assignerName?: string;
  onMarkComplete?: () => void;
  onCompleteWithPhoto?: (photoUrl: string) => void;
  onStartTask?: () => void;
  onReopenTask?: () => void;
  onCompleteTaskWithoutPhoto?: () => void;
  onDelegate?: () => void;
  onReassign?: () => void;
  onSubTaskComplete?: (id: string) => void;
  onDelete?: () => void;
}

const TaskItem: React.FC<TaskItemProps> = ({ 
  task, 
  subTasks = [], 
  parentTask,
  employees, 
  currentUser, 
  assigneeName, 
  assignerName, 
  onMarkComplete,
  onCompleteWithPhoto,
  onStartTask,
  onReopenTask,
  onCompleteTaskWithoutPhoto,
  onDelegate,
  onReassign,
  onSubTaskComplete,
  onDelete
}) => {
  const [showFullImage, setShowFullImage] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const isManager = currentUser.role === 'manager';
  // Allow deletion if the current user created the task OR is a manager
  const canDelete = currentUser.id === task.assignedBy || isManager;
  
  console.log(`🔍 TaskItem Debug - Task ID: ${task.id}`);
  console.log(`🔍 TaskItem Debug - Current User ID: ${currentUser.id}, Role: ${currentUser.role}`);
  console.log(`🔍 TaskItem Debug - Task Assigned By: ${task.assignedBy}`);
  console.log(`🔍 TaskItem Debug - Is Manager: ${isManager}, Can Delete: ${canDelete}`);
  
  const completedSubTasks = subTasks.filter(st => st.status === 'completed');
  const hasSubTasks = subTasks.length > 0;
  
  const allSubTasksDone = hasSubTasks && completedSubTasks.length === subTasks.length;

  const isOverdue = task.status === 'pending' && task.deadline && Date.now() > task.deadline;

  // Name lookup logic
  const getEmployeeName = (employeeId: string | null | undefined) => {
    if (!employeeId) return 'Unknown';
    const employee = employees.find(emp => emp.id === employeeId);
    return employee?.name || 'Unknown';
  };

  const assignerNameDisplay = getEmployeeName(task.assignedBy || task.assigner_id);
  const assigneeNameDisplay = getEmployeeName(task.assignedTo || task.assignee_id);

  // Handle photo upload for tasks that require photos
  const handlePhotoUpload = async (file: File) => {
    setIsUploading(true);
    try {
      alert('Uploading photo...');
      console.log('📸 Uploading photo for task:', task.id);
      
      // Upload to Supabase Storage
      const fileName = `task-proof-${task.id}-${Date.now()}.jpg`;
      const { data, error } = await supabase.storage
        .from('task-proofs')
        .upload(fileName, file, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (error) {
        console.error('❌ Photo upload failed:', error);
        alert('Error: ' + error.message);
        return;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('task-proofs')
        .getPublicUrl(fileName);

      console.log('✅ Photo uploaded successfully:', publicUrl);
      alert('Upload success! Saving task...');

      // Complete task with photo proof
      if (onCompleteWithPhoto) {
        onCompleteWithPhoto(publicUrl);
      }

    } catch (err) {
      console.error('🚨 Unexpected error uploading photo:', err);
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsUploading(false);
    }
  };

  // Trigger photo upload
  const triggerPhotoUpload = () => {
    console.log('📸 Photo required, opening camera...');
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        handlePhotoUpload(file);
      }
    };
    input.click();
  };

  return (
    <div className="space-y-2">
      <div className={`bg-white rounded-2xl p-4 shadow-sm border ${isOverdue ? 'border-red-500 bg-red-50' : (task.status === 'completed' ? 'border-green-100' : (task.status === 'in-progress' ? 'border-blue-500' : 'border-slate-200'))} flex items-center justify-between gap-4 transition-all relative overflow-hidden`}>
        
        {/* Overdue Warning Stripe */}
        {isOverdue && <div className="absolute top-0 left-0 w-1 h-full bg-red-500" />}

        <div className="flex-1 min-w-0 pl-1">
          {/* Context Labels */}
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
             {isOverdue && (
              <span className="inline-flex items-center gap-1 bg-red-500 text-white px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider animate-pulse">
                <AlertTriangle className="w-3 h-3" />
                Overdue
              </span>
            )}
            {task.status === 'in-progress' && (
              <span className="inline-flex items-center gap-1 bg-blue-500 text-white px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider">
                <Play className="w-3 h-3" />
                In Progress
              </span>
            )}
            {task.requirePhoto && (
              <span className="inline-flex items-center gap-1 bg-purple-500 text-white px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider">
                <Camera className="w-3 h-3" />
                Photo Required
              </span>
            )}
            {parentTask && (
              <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border border-amber-100">
                <Layers className="w-2.5 h-2.5" />
                Part of: {parentTask.description}
              </span>
            )}
            {assigneeName && (
              <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border border-blue-100">
                <User className="w-3 h-3" />
                {assigneeName}
              </span>
            )}
            {assignerName && (
              <span className="inline-flex items-center gap-1 bg-slate-50 text-slate-500 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border border-slate-200">
                <UserCheck className="w-3 h-3 text-slate-400" />
                By {assignerName}
              </span>
            )}
            {hasSubTasks && (
              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${allSubTasksDone ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                {completedSubTasks.length}/{subTasks.length} DONE
              </span>
            )}
          </div>
          
          <div className="flex items-start gap-2">
            <p className={`text-base font-semibold break-words leading-tight flex-1 ${task.status === 'completed' ? 'text-slate-400 line-through decoration-slate-300' : (isOverdue ? 'text-red-700' : 'text-slate-800')}`}>
              {task.description}
            </p>
            {hasSubTasks && (
              <button 
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1 hover:bg-slate-50 rounded-lg text-slate-400"
              >
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
              Created: {new Date(task.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            
            {task.deadline && task.status === 'pending' && (
               <span className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest ${isOverdue ? 'text-red-600' : 'text-amber-600'}`}>
                 <Clock className="w-3 h-3" />
                 Due: {new Date(task.deadline).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'})}
               </span>
            )}

            {task.status === 'completed' && task.completedAt && (
              <div className="flex items-center gap-1">
                <Check className="w-3 h-3 text-green-500" />
                <span className="text-[10px] text-green-500 font-black uppercase tracking-tighter">
                  VERIFIED
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Small Ticker / Footer */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-2">
          <div className="text-xs text-gray-500 font-medium flex items-center gap-2">
            <span>👤 {assignerNameDisplay}</span>
            <span className="text-gray-400">➝</span>
            <span>🎯 {assigneeNameDisplay || 'Unassigned'}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          {task.status === 'pending' && (
            <>
              <button 
                onClick={onStartTask}
                className="bg-blue-600 text-white px-4 py-3 rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all flex flex-col items-center justify-center min-w-[80px]"
                title="Start working on this task"
              >
                <Play className="w-5 h-5 mb-0.5" />
                <span className="text-[10px] font-black uppercase">Start</span>
              </button>
              
              {isManager && (
                <>
                  <button 
                    onClick={() => {
                      console.log('🍴 Delegate clicked for:', task.id);
                      console.log('🍴 onDelegate function exists:', typeof onDelegate === 'function');
                      onDelegate?.();
                    }}
                    className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-2 rounded-xl font-bold text-[10px] uppercase shadow-sm active:scale-95 transition-all flex items-center justify-center gap-1.5"
                    title="Create sub-task for someone else"
                  >
                    <GitFork className="w-3.5 h-3.5" />
                    Sub-Task
                  </button>
                  
                  <button 
                    onClick={() => {
                      console.log('➡️ Reassign clicked for:', task.id);
                      console.log('➡️ onReassign function exists:', typeof onReassign === 'function');
                      onReassign?.();
                    }}
                    className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-2 rounded-xl font-bold text-[10px] uppercase shadow-sm active:scale-95 transition-all flex items-center justify-center gap-1.5"
                    title="Reassign this task to someone else"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    Delegate
                  </button>
                </>
              )}
            </>
          )}

          {task.status === 'in-progress' && (
            <>
              {task.requirePhoto ? (
                <button 
                  onClick={() => {
                    console.log('📸 Photo required, triggering upload...');
                    triggerPhotoUpload();
                  }}
                  disabled={isUploading}
                  className={`${isUploading ? 'bg-orange-500' : 'bg-green-600'} text-white px-4 py-3 rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all flex flex-col items-center justify-center min-w-[80px]`}
                  title="Photo proof required to complete"
                >
                  {isUploading ? (
                    <>
                      <div className="w-5 h-5 mb-0.5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                      <span className="text-[10px] font-black uppercase">Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-5 h-5 mb-0.5" />
                      <span className="text-[10px] font-black uppercase">Complete</span>
                    </>
                  )}
                </button>
              ) : (
                <button 
                  onClick={() => {
                    console.log('✅ Completing task without photo...');
                    onCompleteTaskWithoutPhoto?.();
                  }}
                  className="bg-green-600 text-white px-4 py-3 rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all flex flex-col items-center justify-center min-w-[80px]"
                  title="Complete this task"
                >
                  <Check className="w-5 h-5 mb-0.5" />
                  <span className="text-[10px] font-black uppercase">Complete</span>
                </button>
              )}
            </>
          )}

          {task.status === 'completed' && (
            <button 
              onClick={() => {
                console.log('🔄 Reopen clicked for:', task.id);
                console.log('🔄 onReopenTask function exists:', typeof onReopenTask === 'function');
                onReopenTask?.();
              }}
              className="bg-amber-600 text-white px-4 py-3 rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all flex flex-col items-center justify-center min-w-[80px]"
              title="Reopen this task"
            >
              <RotateCcw className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] font-black uppercase">Reopen</span>
            </button>
          )}

          {task.status === 'completed' && task.proof?.imageUrl && (
            <div 
              onClick={() => setShowFullImage(true)}
              className="w-14 h-14 rounded-xl overflow-hidden border-2 border-green-200 cursor-pointer active:scale-90 transition-transform relative"
            >
              <img src={task.proof.imageUrl} alt="Proof" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
                <Maximize2 className="w-4 h-4 text-white drop-shadow" />
              </div>
            </div>
          )}

          {canDelete && (
             <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  console.log('🗑️ Delete clicked for:', task.id);
                  console.log('🗑️ onDelete function exists:', typeof onDelete === 'function');
                  onDelete?.(); 
                }}
                className="bg-red-50 text-red-400 p-2 rounded-xl active:scale-95 transition-all flex items-center justify-center hover:bg-red-100"
                title="Delete Task"
             >
               <Trash2 className="w-4 h-4" />
             </button>
          )}
        </div>
      </div>

      {/* Sub-tasks Render - Recursive */}
      {isExpanded && hasSubTasks && (
        <div className="ml-6 space-y-2 border-l-2 border-slate-200 pl-4 animate-in slide-in-from-left-2 duration-200">
          {subTasks.map(st => (
            <TaskItem 
              key={st.id}
              task={st}
              subTasks={[]} 
              employees={employees}
              currentUser={currentUser}
              assigneeName={employees.find(e => e.id === st.assignedTo)?.name}
              assignerName={employees.find(e => e.id === st.assignedBy)?.name}
              onMarkComplete={() => onSubTaskComplete?.(st.id)} 
              onDelegate={() => {}} 
              onDelete={() => onDelete?.()}
            />
          ))}
        </div>
      )}

      {/* Full Screen Image Modal */}
      {showFullImage && task.proof?.imageUrl && (
        <div 
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4"
          onClick={() => setShowFullImage(false)}
        >
          <div className="relative w-full max-w-lg">
            <img 
              src={task.proof.imageUrl} 
              alt="Proof Full Size" 
              className="w-full h-auto rounded-lg shadow-2xl border-4 border-white/10"
            />
            <button 
              className="absolute -top-12 right-0 text-white font-bold p-2 bg-white/10 rounded-full"
              onClick={() => setShowFullImage(false)}
            >
              <Maximize2 className="w-6 h-6 rotate-45" />
            </button>
            <div className="text-white text-center mt-6 space-y-2">
               <p className="font-bold text-xl tracking-tight">{task.description}</p>
               <div className="flex flex-col items-center gap-1 text-xs opacity-60 font-medium">
                 {assigneeName && <p>Completed by: {assigneeName}</p>}
                 {assignerName && <p>Alloted by: {assignerName}</p>}
                 {task.completedAt && <p>Verified on: {new Date(task.completedAt).toLocaleString()}</p>}
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskItem;
