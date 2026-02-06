import React, { useState } from 'react';
import { DealershipTask, Employee, TaskRemark } from '../types';
import { Check, Camera, Maximize2, User, UserCheck, GitFork, ChevronDown, ChevronRight, Layers, Trash2, AlertTriangle, Clock, ArrowRight, Play, RotateCcw, CheckCircle, UserPlus, X, Edit, MessageSquarePlus, Send } from 'lucide-react';
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
  onEdit?: () => void;
  onAddRemark?: (taskId: string, remark: string) => void;
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
  onDelete,
  onEdit,
  onAddRemark
}) => {
  const [showFullImage, setShowFullImage] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [newRemark, setNewRemark] = useState('');
  const [showRemarkInput, setShowRemarkInput] = useState(false);
  const [showRemarksExpanded, setShowRemarksExpanded] = useState(false);

  const isManager = currentUser.role === 'manager' || currentUser.role === 'super_admin';
  const canDelete = currentUser.id === task.assignedBy || isManager;
  const canEdit = currentUser.id === task.assignedBy || isManager;
  
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

  const handlePhotoUpload = async (file: File) => {
    setIsUploading(true);
    try {
      console.log('📸 Starting photo upload for task:', task.id);
      
      // Upload to Supabase Storage
      const fileName = `task-proof-${task.id}-${Date.now()}.jpg`;
      const { data, error } = await supabase.storage
        .from('task-proofs')
        .upload(fileName, file, {
          contentType: 'image/jpeg',
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        console.error('❌ Photo upload error:', error);
        alert('Failed to upload photo: ' + error.message);
        return;
      }

      console.log('✅ Photo uploaded successfully:', data);

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('task-proofs')
        .getPublicUrl(fileName);

      console.log('🔗 Public URL:', publicUrl);
      alert('Photo uploaded successfully!');
      onCompleteWithPhoto?.(publicUrl);
      
    } catch (error) {
      console.error('❌ Photo upload error:', error);
      alert('Failed to upload photo');
    } finally {
      setIsUploading(false);
    }
  };

  const triggerPhotoUpload = () => {
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

  const handleAddRemark = () => {
    if (newRemark.trim() && onAddRemark) {
      onAddRemark(task.id, newRemark.trim());
      setNewRemark('');
      setShowRemarkInput(false);
    }
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
            {hasSubTasks && (
              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${allSubTasksDone ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                {completedSubTasks.length}/{subTasks.length} DONE
              </span>
            )}
            {/* Minimal Assignment Info */}
            <span className="text-[8px] text-gray-400 font-medium">
              {assignerNameDisplay && assigneeNameDisplay ? 
                `${assignerNameDisplay}→${assigneeNameDisplay}` : 
                assignerNameDisplay ? `by ${assignerNameDisplay}` : 
                assigneeNameDisplay ? `to ${assigneeNameDisplay}` : ''
              }
            </span>
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

        <div className="flex flex-col gap-2 shrink-0">
          {task.status === 'pending' && (
            <>
              <button 
                onClick={onStartTask}
                className="bg-blue-600 text-white px-4 py-3 rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all flex flex-col items-center justify-center min-w-[80px]"
                title="Accept this task"
              >
                <span className="text-[10px] font-black uppercase">Accept</span>
              </button>
              
              {isManager && (
                <>
                  <button 
                    onClick={onDelegate}
                    className="bg-purple-600 text-white px-4 py-3 rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all flex flex-col items-center justify-center min-w-[80px]"
                    title="Delegate this task"
                  >
                    <UserPlus className="w-5 h-5 mb-0.5" />
                    <span className="text-[10px] font-black uppercase">Delegate</span>
                  </button>
                  
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
                  
                  {canEdit && (
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        console.log('✏️ Edit clicked for:', task.id);
                        console.log('✏️ onEdit function exists:', typeof onEdit === 'function');
                        onEdit?.(); 
                      }}
                      className="bg-blue-50 text-blue-400 p-2 rounded-xl active:scale-95 transition-all flex items-center justify-center hover:bg-blue-100"
                      title="Edit Task"
                     >
                       <Edit className="w-4 h-4" />
                     </button>
                  )}
                </>
              )}
            </>
          )}

          {task.status === 'in-progress' && (
            <>
              {task.requirePhoto ? (
                <button 
                  onClick={triggerPhotoUpload}
                  disabled={isUploading}
                  className="bg-green-600 text-white px-4 py-3 rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all flex flex-col items-center justify-center min-w-[80px] disabled:opacity-50"
                  title="Complete with photo proof"
                >
                  {isUploading ? (
                    <>
                      <div className="w-5 h-5 mb-0.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
                  onClick={() => onCompleteTaskWithoutPhoto?.()}
                  className="bg-green-600 text-white px-4 py-3 rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all flex flex-col items-center justify-center min-w-[80px]"
                  title="Mark as completed"
                >
                  <Check className="w-5 h-5 mb-0.5" />
                  <span className="text-[10px] font-black uppercase">Complete</span>
                </button>
              )}
              
              <button 
                onClick={() => setShowRemarkInput(!showRemarkInput)}
                className="bg-blue-100 text-blue-600 px-4 py-3 rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all flex flex-col items-center justify-center min-w-[80px]"
                title="Add progress update"
              >
                <MessageSquarePlus className="w-5 h-5 mb-0.5" />
                <span className="text-[10px] font-black uppercase">Update</span>
              </button>
            </>
          )}

          {task.status === 'completed' && (
            <>
              {task.proof && (
                <button 
                  onClick={() => setShowFullImage(true)}
                  className="bg-purple-100 text-purple-700 px-4 py-3 rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all flex flex-col items-center justify-center min-w-[80px]"
                  title="View proof"
                >
                  <Camera className="w-5 h-5 mb-0.5" />
                  <span className="text-[10px] font-black uppercase">Proof</span>
                </button>
              )}
              
              {isManager && (
                <>
                  <button 
                    onClick={onReopenTask}
                    className="bg-amber-600 text-white px-4 py-3 rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all flex flex-col items-center justify-center min-w-[80px]"
                    title="Reopen this task"
                  >
                    <RotateCcw className="w-5 h-5 mb-0.5" />
                    <span className="text-[10px] font-black uppercase">Reopen</span>
                  </button>
                  
                  {canDelete && (
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        console.log('🗑️ Delete clicked for completed task:', task.id);
                        console.log('🗑️ onDelete function exists:', typeof onDelete === 'function');
                        onDelete?.(); 
                      }}
                      className="bg-red-50 text-red-400 p-2 rounded-xl active:scale-95 transition-all flex items-center justify-center hover:bg-red-100"
                      title="Delete Task"
                     >
                       <Trash2 className="w-4 h-4" />
                     </button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Remark Input Section */}
      {task.status === 'in-progress' && showRemarkInput && (
        <div className="bg-blue-50 rounded-2xl p-4 border border-blue-200">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquarePlus className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-semibold text-blue-800">Add Progress Update</span>
            </div>
            <textarea
              value={newRemark}
              onChange={(e) => setNewRemark(e.target.value)}
              placeholder="Update on task progress, stages completed, or any relevant information..."
              className="w-full bg-white border border-blue-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none h-20"
              rows={3}
            />
            <div className="flex gap-2">
              <button
                onClick={handleAddRemark}
                disabled={!newRemark.trim()}
                className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-xl font-bold text-sm active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                Add Update
              </button>
              <button
                onClick={() => {
                  setShowRemarkInput(false);
                  setNewRemark('');
                }}
                className="px-4 bg-gray-500 text-white py-2 rounded-xl font-bold text-sm active:scale-95 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remarks Display Section */}
      {task.remarks && task.remarks.length > 0 && (
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
          <div 
            className="flex items-center gap-2 mb-3 cursor-pointer hover:bg-slate-100 p-2 rounded-lg transition-colors"
            onClick={() => setShowRemarksExpanded(!showRemarksExpanded)}
          >
            <MessageSquarePlus className="w-4 h-4 text-slate-600" />
            <span className="text-sm font-semibold text-slate-700">Progress Updates ({task.remarks.length})</span>
            <ChevronDown 
              className={`w-4 h-4 text-slate-500 transition-transform ${showRemarksExpanded ? 'rotate-180' : ''}`} 
            />
          </div>
          
          {showRemarksExpanded && (
            <div className="space-y-2 mt-2">
              {task.remarks.map((remark, index) => (
                <div key={remark.id} className="bg-white rounded-xl p-3 border border-slate-100">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-700">{remark.employeeName}</span>
                    <span className="text-xs text-slate-500">
                      {new Date(remark.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">{remark.remark}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Proof Image Modal */}
      {showFullImage && task.proof && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Task Proof</h3>
              <button 
                onClick={() => setShowFullImage(false)}
                className="p-1 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-4">
              <img 
                src={task.proof.imageUrl} 
                alt="Task proof" 
                className="w-full rounded-lg"
              />
              <p className="text-sm text-slate-500 mt-2">
                Completed: {new Date(task.proof.timestamp).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskItem;
