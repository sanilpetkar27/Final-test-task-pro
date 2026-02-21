import React, { useState, useEffect, useRef } from 'react';
import { DealershipTask, Employee, UserRole, TaskStatus, TaskType, RecurrenceFrequency, TaskRemark } from '../types';
import { supabase } from '../src/lib/supabase';
import { sendTaskCompletionNotification } from '../src/utils/pushNotifications';
import TaskItem from './TaskItem';
import CompletionModal from './CompletionModal';
import DelegationModal from './DelegationModal';
import ReassignModal from './ReassignModal';
import { Plus, Clock, CheckCircle2, UserPlus, ClipboardList as ClipboardIcon, CalendarClock, Timer, Camera, Bug, User, AlertTriangle, Calendar, Mic, MicOff } from 'lucide-react';

interface DashboardProps {
  tasks: DealershipTask[];
  employees: Employee[];
  currentUser: Employee;
  onAddTask: (
    desc: string,
    assignedTo?: string,
    parentTaskId?: string,
    deadline?: number,
    requirePhoto?: boolean,
    taskType?: TaskType,
    recurrenceFrequency?: RecurrenceFrequency | null
  ) => Promise<void> | void;
  onStartTask: (id: string) => void;
  onReopenTask: (id: string) => void;
  onCompleteTask: (id: string, proof: { imageUrl: string, timestamp: number }) => void;
  onCompleteTaskWithoutPhoto: (id: string) => void;
  onReassignTask: (taskId: string, newAssigneeId: string) => void;
  onDeleteTask: (id: string) => void;
  onUpdateTaskRemarks?: (taskId: string, remarks: TaskRemark[]) => void;
}

const isMissingTaskRecurrenceColumnError = (error: any): boolean => {
  const message = String(error?.message || '').toLowerCase();
  const missingRecurrenceColumn =
    message.includes('recurrence_frequency') || message.includes('task_type');
  const missingInSchema =
    message.includes('schema cache') || (message.includes('column') && message.includes('does not exist'));
  return missingRecurrenceColumn && missingInSchema;
};

const isMissingNextRecurrenceNotificationColumnError = (error: any): boolean => {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('next_recurrence_notification_at') &&
    (message.includes('schema cache') || (message.includes('column') && message.includes('does not exist')))
  );
};

const stripTaskRecurrenceFields = (payload: Record<string, any>) => {
  const legacyPayload = { ...payload };
  delete legacyPayload.task_type;
  delete legacyPayload.recurrence_frequency;
  delete legacyPayload.taskType;
  delete legacyPayload.recurrenceFrequency;
  delete legacyPayload.next_recurrence_notification_at;
  delete legacyPayload.nextRecurrenceNotificationAt;
  return legacyPayload;
};

const stripTaskNextRecurrenceField = (payload: Record<string, any>) => {
  const legacyPayload = { ...payload };
  delete legacyPayload.next_recurrence_notification_at;
  delete legacyPayload.nextRecurrenceNotificationAt;
  return legacyPayload;
};

const DAILY_MS = 24 * 60 * 60 * 1000;
const WEEKLY_MS = 7 * DAILY_MS;
const MONTHLY_MS = 30 * DAILY_MS;

const getRecurrenceIntervalMs = (frequency: RecurrenceFrequency | null | undefined): number => {
  if (frequency === 'daily') return DAILY_MS;
  if (frequency === 'weekly') return WEEKLY_MS;
  if (frequency === 'monthly') return MONTHLY_MS;
  return 0;
};

const Dashboard: React.FC<DashboardProps> = ({ tasks, employees, currentUser, onAddTask, onStartTask, onReopenTask, onCompleteTask, onCompleteTaskWithoutPhoto, onReassignTask, onDeleteTask, onUpdateTaskRemarks }) => {
  const [view, setView] = useState<'pending' | 'in-progress' | 'completed'>('pending');
  const [deadlineView, setDeadlineView] = useState<'overdue' | 'today' | 'upcoming' | 'all'>('all');
  
  // Voice recognition state
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);
  const [isVoiceSupported, setIsVoiceSupported] = useState(false);
  const [isPreparingMicPermission, setIsPreparingMicPermission] = useState(false);
  const isStartingListeningRef = useRef(false);
  const isStoppingListeningRef = useRef(false);
  const lastVoiceStartAtRef = useRef(0);
  const lastVoiceResultAtRef = useRef(0);
  const autoVoiceRetryCountRef = useRef(0);
  const voiceSafetyStopTimerRef = useRef<number | null>(null);
  const voiceIdleStopTimerRef = useRef<number | null>(null);
  const hasPrimedMicPermissionRef = useRef(false);
  
  // Keep task description ephemeral to avoid stale dictated text after app relaunch.
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [assigneeId, setAssigneeId] = useState(() => {
    return localStorage.getItem('task_form_assignee') || 'none';
  });
  const [deadline, setDeadline] = useState(() => {
    return localStorage.getItem('task_form_deadline') || '';
  });
  const [requirePhoto, setRequirePhoto] = useState(() => {
    return localStorage.getItem('task_form_photo') === 'true';
  });
  const [taskType, setTaskType] = useState<TaskType>(() => {
    const cachedTaskType = localStorage.getItem('task_form_task_type');
    return cachedTaskType === 'recurring' ? 'recurring' : 'one_time';
  });
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<RecurrenceFrequency | ''>(() => {
    const cachedFrequency = localStorage.getItem('task_form_recurrence_frequency');
    return cachedFrequency === 'daily' || cachedFrequency === 'weekly' || cachedFrequency === 'monthly'
      ? cachedFrequency
      : '';
  });
  
  // Clear legacy cached task description so old dictated text is not restored.
  useEffect(() => {
    localStorage.removeItem('task_form_desc');
  }, []);

  // Persist form state to localStorage
  useEffect(() => {
    localStorage.setItem('task_form_assignee', assigneeId);
  }, [assigneeId]);
  
  useEffect(() => {
    localStorage.setItem('task_form_deadline', deadline);
  }, [deadline]);
  
  useEffect(() => {
    localStorage.setItem('task_form_photo', String(requirePhoto));
  }, [requirePhoto]);

  useEffect(() => {
    localStorage.setItem('task_form_task_type', taskType);
  }, [taskType]);

  useEffect(() => {
    if (taskType === 'recurring' && recurrenceFrequency) {
      localStorage.setItem('task_form_recurrence_frequency', recurrenceFrequency);
      return;
    }
    localStorage.removeItem('task_form_recurrence_frequency');
  }, [taskType, recurrenceFrequency]);

  useEffect(() => {
    if (taskType === 'one_time' && recurrenceFrequency) {
      setRecurrenceFrequency('');
    }
  }, [taskType, recurrenceFrequency]);
  
  const clearForm = () => {
    setNewTaskDesc('');
    setAssigneeId('none');
    setDeadline('');
    setRequirePhoto(false);
    setTaskType('one_time');
    setRecurrenceFrequency('');
    localStorage.removeItem('task_form_desc');
    localStorage.removeItem('task_form_assignee');
    localStorage.removeItem('task_form_deadline');
    localStorage.removeItem('task_form_photo');
    localStorage.removeItem('task_form_task_type');
    localStorage.removeItem('task_form_recurrence_frequency');
  };
  // Dashboard uses employees from props, no local state needed
  const [selectedPersonFilter, setSelectedPersonFilter] = useState('ALL');
  
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [delegatingTaskId, setDelegatingTaskId] = useState<string | null>(null);
  const [reassigningTaskId, setReassigningTaskId] = useState<string | null>(null);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const lastTaskSubmitRef = useRef<{ signature: string; timestamp: number } | null>(null);
  const [statusBumpTimestamps, setStatusBumpTimestamps] = useState<Record<string, number>>({});
  const previousTaskStatusRef = useRef<Record<string, TaskStatus>>({});

  // Dashboard uses employees from props, no independent fetching needed
  const clearVoiceSafetyStopTimer = () => {
    if (voiceSafetyStopTimerRef.current !== null) {
      window.clearTimeout(voiceSafetyStopTimerRef.current);
      voiceSafetyStopTimerRef.current = null;
    }
  };

  const clearVoiceIdleStopTimer = () => {
    if (voiceIdleStopTimerRef.current !== null) {
      window.clearTimeout(voiceIdleStopTimerRef.current);
      voiceIdleStopTimerRef.current = null;
    }
  };

  const stopRecognitionInstanceSafely = (recognitionInstance: any) => {
    try {
      recognitionInstance.stop();
    } catch {
      try {
        recognitionInstance.abort();
      } catch {
        // noop
      }
    }
  };

  const primeMicrophonePermission = async (): Promise<boolean> => {
    if (hasPrimedMicPermissionRef.current) {
      return true;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      hasPrimedMicPermissionRef.current = true;
      return true;
    }

    setIsPreparingMicPermission(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      hasPrimedMicPermissionRef.current = true;
      return true;
    } catch (error: any) {
      const errorName = String(error?.name || '').toLowerCase();
      if (errorName === 'notallowederror' || errorName === 'securityerror') {
        alert('Microphone permission denied. Please allow microphone access to use voice input.');
      } else {
        alert('Unable to access microphone. Please try again.');
      }
      return false;
    } finally {
      setIsPreparingMicPermission(false);
    }
  };

  // Initialize voice recognition
  useEffect(() => {
    let recognitionInstance: any = null;

    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      
      if (SpeechRecognition) {
        setIsVoiceSupported(true);
        recognitionInstance = new SpeechRecognition();
        recognitionInstance.continuous = false;
        recognitionInstance.interimResults = true;
        recognitionInstance.lang = 'en-US';

        recognitionInstance.onstart = () => {
          isStartingListeningRef.current = false;
          isStoppingListeningRef.current = false;
          lastVoiceStartAtRef.current = Date.now();
          // Reset per-session result marker so no-result retries work reliably.
          lastVoiceResultAtRef.current = 0;
          setIsListening(true);
          clearVoiceIdleStopTimer();

          // Safety guard: close dangling sessions to prevent background mic lock on iOS.
          clearVoiceSafetyStopTimer();
          voiceSafetyStopTimerRef.current = window.setTimeout(() => {
            if (!isStoppingListeningRef.current) {
              isStoppingListeningRef.current = true;
              setIsListening(false);
              stopRecognitionInstanceSafely(recognitionInstance);
              window.setTimeout(() => {
                try {
                  recognitionInstance.abort();
                } catch {
                  // noop
                }
              }, 120);
            }
          }, 12000);
        };

        recognitionInstance.onresult = (event: any) => {
          lastVoiceResultAtRef.current = Date.now();
          const transcript = Array.from(event.results)
            .map((result: any) => result[0])
            .map((result: any) => result.transcript)
            .join('');
          
          setNewTaskDesc(transcript);

          // Auto-close shortly after speech text arrives so iOS doesn't keep mic active in PWA mode.
          clearVoiceIdleStopTimer();
          voiceIdleStopTimerRef.current = window.setTimeout(() => {
            if (!isStoppingListeningRef.current) {
              isStoppingListeningRef.current = true;
              setIsListening(false);
              stopRecognitionInstanceSafely(recognitionInstance);
              window.setTimeout(() => {
                try {
                  recognitionInstance.abort();
                } catch {
                  // noop
                }
              }, 120);
            }
          }, 900);

          const hasFinalResult = Array.from(event.results || []).some((result: any) => Boolean(result?.isFinal));
          if (hasFinalResult && !isStoppingListeningRef.current) {
            // On iOS, explicit close after final transcript prevents delayed audio-capture errors.
            isStoppingListeningRef.current = true;
            setIsListening(false);
            clearVoiceSafetyStopTimer();
            clearVoiceIdleStopTimer();
            window.setTimeout(() => {
              stopRecognitionInstanceSafely(recognitionInstance);
              window.setTimeout(() => {
                try {
                  recognitionInstance.abort();
                } catch {
                  // noop
                }
              }, 120);
            }, 80);
          }
        };

        recognitionInstance.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          isStartingListeningRef.current = false;
          clearVoiceSafetyStopTimer();
          clearVoiceIdleStopTimer();

          // On iOS Safari, manual stop often emits "aborted" or "no-speech".
          if (
            event.error === 'aborted' ||
            (isStoppingListeningRef.current && event.error === 'no-speech')
          ) {
            return;
          }

          setIsListening(false);
          
          if (event.error === 'not-allowed') {
            alert('Microphone permission denied. Please allow microphone access to use voice input.');
          } else if (event.error === 'no-speech') {
            // No-speech is noisy on mobile browsers; keep it silent.
            return;
          } else if (event.error === 'audio-capture') {
            // Safari/iOS can emit this after an already-finished capture; avoid noisy popups.
            return;
          } else {
            alert('Voice input error: ' + event.error);
          }
        };

        recognitionInstance.onend = () => {
          clearVoiceSafetyStopTimer();
          clearVoiceIdleStopTimer();
          const endedWithoutInput =
            !isStoppingListeningRef.current &&
            lastVoiceStartAtRef.current > 0 &&
            lastVoiceResultAtRef.current < lastVoiceStartAtRef.current;
          const sessionDuration = Date.now() - lastVoiceStartAtRef.current;
          const shouldAutoRetryNoInput =
            endedWithoutInput &&
            sessionDuration < 5000 &&
            autoVoiceRetryCountRef.current < 2;

          isStartingListeningRef.current = false;
          isStoppingListeningRef.current = false;
          setIsListening(false);

          // iOS PWA may end the first capture immediately (permission/activation edge case).
          // Retry automatically so user doesn't need to tap mic twice.
          if (shouldAutoRetryNoInput) {
            autoVoiceRetryCountRef.current += 1;
            window.setTimeout(() => {
              if (recognitionInstance) {
                try {
                  isStartingListeningRef.current = true;
                  recognitionInstance.start();
                } catch {
                  isStartingListeningRef.current = false;
                }
              }
            }, 220);
            return;
          }

          autoVoiceRetryCountRef.current = 0;
        };

        setRecognition(recognitionInstance);
      } else {
        setIsVoiceSupported(false);
        console.log('Speech recognition not supported');
      }
    }
    return () => {
      clearVoiceSafetyStopTimer();
      clearVoiceIdleStopTimer();
      if (recognitionInstance) {
        try {
          recognitionInstance.onstart = null;
          recognitionInstance.onresult = null;
          recognitionInstance.onerror = null;
          recognitionInstance.onend = null;
          recognitionInstance.abort();
        } catch {
          // No-op: browser may already have cleaned up recognition instance.
        }
      }
    };
  }, []);

  // Voice input handlers
  const startListening = async () => {
    if (!recognition || isListening || isStartingListeningRef.current || isPreparingMicPermission) {
      return;
    }

    const permissionReady = await primeMicrophonePermission();
    if (!permissionReady) {
      return;
    }

    // Small handoff delay helps iOS release getUserMedia before SpeechRecognition.start().
    await new Promise((resolve) => window.setTimeout(resolve, 80));

    try {
      isStoppingListeningRef.current = false;
      isStartingListeningRef.current = true;
      autoVoiceRetryCountRef.current = 0;
      recognition.start();
    } catch (error: any) {
      console.error('Failed to start speech recognition:', error);
      isStartingListeningRef.current = false;
      const errorMessage = String(error?.message || '').toLowerCase();

      if (errorMessage.includes('already started')) {
        return;
      }

      // Recover from stale state by resetting the instance and retrying once.
      if (errorMessage.includes('invalidstate') || errorMessage.includes('start')) {
        try {
          recognition.abort();
        } catch {
          // noop
        }
        window.setTimeout(() => {
          try {
            isStartingListeningRef.current = true;
            recognition.start();
          } catch (retryError) {
            isStartingListeningRef.current = false;
            console.error('Speech recognition retry failed:', retryError);
          }
        }, 180);
        return;
      }

      alert('Unable to start voice input. Please try again.');
    }
  };

  const stopListening = () => {
    if (recognition && (isListening || isStartingListeningRef.current)) {
      isStoppingListeningRef.current = true;
      isStartingListeningRef.current = false;
      autoVoiceRetryCountRef.current = 0;
      clearVoiceSafetyStopTimer();
      clearVoiceIdleStopTimer();

      try {
        recognition.stop();
      } catch {
        try {
          recognition.abort();
        } catch {
          // noop
        }
      } finally {
        window.setTimeout(() => {
          try {
            recognition.abort();
          } catch {
            // noop
          }
        }, 120);
        window.setTimeout(() => {
          setIsListening(false);
        }, 150);
      }
    } else {
      setIsListening(false);
    }
  };

  const toggleListening = () => {
    if (isListening || isStartingListeningRef.current) {
      stopListening();
    } else {
      void startListening();
    }
  };

  useEffect(() => {
    if (!recognition || typeof document === 'undefined') {
      return;
    }

    const releaseVoiceCapture = () => {
      if (!isListening && !isStartingListeningRef.current) {
        return;
      }

      isStoppingListeningRef.current = true;
      isStartingListeningRef.current = false;
      clearVoiceSafetyStopTimer();
      clearVoiceIdleStopTimer();
      setIsListening(false);

      try {
        recognition.abort();
      } catch {
        // noop
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        releaseVoiceCapture();
      }
    };

    const handlePageHide = () => {
      releaseVoiceCapture();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [recognition, isListening]);

  // Dashboard uses tasks from props, not fetched independently

  const isManager = currentUser.role === 'manager' || currentUser.role === 'owner';
  const isSuperAdmin = currentUser.role === 'super_admin';
  const canAssignTasks = currentUser.role === 'manager' || currentUser.role === 'super_admin' || currentUser.role === 'owner'; // For UI permissions

  useEffect(() => {
    const previousStatuses = previousTaskStatusRef.current;
    const nextStatuses: Record<string, TaskStatus> = {};
    const bumpedTaskIds: Record<string, number> = {};
    const now = Date.now();

    for (const task of tasks) {
      const previousStatus = previousStatuses[task.id];
      if (
        previousStatus &&
        previousStatus !== task.status &&
        (task.status === 'in-progress' || task.status === 'completed')
      ) {
        bumpedTaskIds[task.id] = now;
      }
      nextStatuses[task.id] = task.status;
    }

    previousTaskStatusRef.current = nextStatuses;

    setStatusBumpTimestamps((prev) => {
      const activeTaskIds = new Set(tasks.map((task) => task.id));
      const cleaned: Record<string, number> = {};

      for (const [taskId, timestamp] of Object.entries(prev)) {
        if (activeTaskIds.has(taskId)) {
          cleaned[taskId] = timestamp;
        }
      }

      const merged = { ...cleaned, ...bumpedTaskIds };
      const prevKeys = Object.keys(prev);
      const mergedKeys = Object.keys(merged);
      const sameShape =
        prevKeys.length === mergedKeys.length &&
        prevKeys.every((key) => merged[key] === prev[key]);

      return sameShape ? prev : merged;
    });
  }, [tasks]);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreatingTask) {
      return;
    }

    const deadlineTimestamp = deadline ? new Date(deadline).getTime() : undefined;
    const normalizedTaskType: TaskType = taskType === 'recurring' ? 'recurring' : 'one_time';
    const normalizedRecurrenceFrequency: RecurrenceFrequency | null =
      normalizedTaskType === 'recurring' ? (recurrenceFrequency || null) : null;

    if (!newTaskDesc.trim()) {
      console.log('Empty task description, aborting');
      return;
    }

    if (normalizedTaskType === 'recurring' && !normalizedRecurrenceFrequency) {
      alert('Please select recurrence frequency for recurring tasks.');
      return;
    }

    const submitSignature = [
      newTaskDesc.trim().toLowerCase(),
      assigneeId,
      deadline || '',
      requirePhoto ? '1' : '0',
      normalizedTaskType,
      normalizedRecurrenceFrequency || ''
    ].join('|');
    const now = Date.now();
    const lastSubmit = lastTaskSubmitRef.current;
    if (
      lastSubmit &&
      lastSubmit.signature === submitSignature &&
      now - lastSubmit.timestamp < 1500
    ) {
      console.log('Skipping duplicate task submit on rapid tap');
      return;
    }
    lastTaskSubmitRef.current = { signature: submitSignature, timestamp: now };

    setIsCreatingTask(true);
    try {
      await Promise.resolve(onAddTask(
        newTaskDesc.trim(),
        assigneeId === 'none' ? undefined : assigneeId,
        undefined,
        deadlineTimestamp,
        requirePhoto,
        normalizedTaskType,
        normalizedRecurrenceFrequency
      ));

      // IMMEDIATELY reset form states
      setNewTaskDesc('');
      setAssigneeId('none');
      setDeadline('');
      setRequirePhoto(false);
      setTaskType('one_time');
      setRecurrenceFrequency('');

      // Auto-reset filter to show new task
      setSelectedPersonFilter('ALL');

      // Reset form and clear localStorage
      clearForm();
    } catch (err) {
      console.error('Unexpected error creating task:', err);
      alert('Unexpected Error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsCreatingTask(false);
    }
  };

  const handleInlineTaskUpdate = async (
    taskId: string,
    updatePayload: {
      description: string;
      assignedTo: string | null;
      deadline?: number;
      requirePhoto: boolean;
      taskType: TaskType;
      recurrenceFrequency: RecurrenceFrequency | null;
    }
  ): Promise<boolean> => {
    const normalizedTaskType: TaskType = updatePayload.taskType === 'recurring' ? 'recurring' : 'one_time';
    const normalizedRecurrenceFrequency: RecurrenceFrequency | null =
      normalizedTaskType === 'recurring' ? updatePayload.recurrenceFrequency : null;

    if (!updatePayload.description.trim()) {
      alert('Task description is required.');
      return false;
    }

    if (normalizedTaskType === 'recurring' && !normalizedRecurrenceFrequency) {
      alert('Please select recurrence frequency for recurring tasks.');
      return false;
    }

    const nextRecurrenceNotificationAt =
      normalizedTaskType === 'recurring'
        ? Date.now() + getRecurrenceIntervalMs(normalizedRecurrenceFrequency)
        : null;

    const updateData = {
      description: updatePayload.description.trim(),
      assignedTo: updatePayload.assignedTo,
      task_type: normalizedTaskType,
      recurrence_frequency: normalizedRecurrenceFrequency,
      next_recurrence_notification_at: nextRecurrenceNotificationAt,
      deadline: updatePayload.deadline,
      requirePhoto: updatePayload.requirePhoto
    };

    let result = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', taskId);

    if (result.error && isMissingNextRecurrenceNotificationColumnError(result.error)) {
      const retryUpdateData = stripTaskNextRecurrenceField(updateData as unknown as Record<string, any>);
      result = await supabase
        .from('tasks')
        .update(retryUpdateData)
        .eq('id', taskId);

      if (!result.error) {
        alert('Task updated, but recurring reminder scheduling needs a DB migration to be fully available.');
      }
    }

    if (result.error && isMissingTaskRecurrenceColumnError(result.error)) {
      const legacyUpdateData = stripTaskRecurrenceFields(updateData as unknown as Record<string, any>);
      result = await supabase
        .from('tasks')
        .update(legacyUpdateData)
        .eq('id', taskId);

      if (!result.error) {
        alert('Task updated, but recurrence settings need a DB migration to be fully available.');
      }
    }

    if (result.error) {
      console.error('Task update failed:', result.error);
      alert('Task Update Error: ' + result.error.message);
      return false;
    }

    return true;
  };
  const handleDelegate = async (parentTaskId: string, desc: string, targetAssigneeId: string, deadlineTimestamp?: number) => {
    try {
      const trimmedDescription = desc.trim();
      if (!trimmedDescription) {
        alert('Task description is required.');
        return;
      }

      console.log('🔧 Creating delegated task...');

      // Route delegation through the main add-task pipeline so tenant/company_id
      // and recurrence-safe insert fallbacks stay consistent in one place.
      await Promise.resolve(
        onAddTask(
          trimmedDescription,
          targetAssigneeId,
          parentTaskId,
          deadlineTimestamp
        )
      );

      // Auto-reset filter to show new task
      setSelectedPersonFilter('ALL');
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
              
              // Note: Dashboard doesn't have setEmployees prop, so we can't update local state
              // The parent App.tsx will handle employee state updates
              // Note: Dashboard doesn't have setEmployees prop, so we can't update local state
              // The parent App.tsx will handle employee state updates
              
              // Send completion notification to task creator
              const taskCreator = employees.find(emp => emp.id === completedTask?.assignedBy);
              if (taskCreator) {
                await sendTaskCompletionNotification(
                  completedTask.description,
                  currentUser.name,
                  taskCreator.id
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
      return employees
        .filter(emp => emp.role === 'manager')
        .map(emp => ({
          id: emp.id,
          name: emp.name,
          role: emp.role
        }));
    } else if (isManager) {
      // Managers can filter by assignees (employees)
      return employees.map(emp => ({
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
        .map(managerId => employees.find(emp => emp.id === managerId))
        .filter(emp => emp && emp.role === 'manager');
      
      return uniqueManagers as Employee[];
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
        employeeName:
          currentUser.name?.trim() ||
          currentUser.email?.split('@')[0] ||
          'Unknown User',
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
        
        console.log('Remark added successfully');
        onUpdateTaskRemarks?.(taskId, updatedRemarks as TaskRemark[]);
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

  const getTaskActivityTimestamp = (task: DealershipTask): number => {
    const rawUpdatedAt = (task as any).updatedAt;
    const rawUpdatedAtSnake = (task as any).updated_at;

    const updatedAtFromCamel = typeof rawUpdatedAt === 'number' ? rawUpdatedAt : 0;
    const updatedAtFromSnake =
      typeof rawUpdatedAtSnake === 'number'
        ? rawUpdatedAtSnake
        : typeof rawUpdatedAtSnake === 'string'
        ? (Number.isNaN(Date.parse(rawUpdatedAtSnake)) ? 0 : Date.parse(rawUpdatedAtSnake))
        : 0;
    const completedAt = Number(task.completedAt || 0);
    const statusBump = statusBumpTimestamps[task.id] || 0;
    const createdAt = Number(task.createdAt || 0);

    return Math.max(createdAt, completedAt, updatedAtFromCamel, updatedAtFromSnake, statusBump);
  };

  const sortTasksByRecentActivity = (taskRows: DealershipTask[]): DealershipTask[] =>
    [...taskRows].sort((left, right) => getTaskActivityTimestamp(right) - getTaskActivityTimestamp(left));

  const filteredPendingTasks = sortTasksByRecentActivity(getDeadlineFilteredTasks(getFilteredTasks(pendingTasks)));
  const filteredInProgressTasks = sortTasksByRecentActivity(getDeadlineFilteredTasks(getFilteredTasks(inProgressTasks)));
  const filteredCompletedTasks = sortTasksByRecentActivity(getDeadlineFilteredTasks(getFilteredTasks(completedTasks)));

  const tasksToShow = view === 'pending' ? filteredPendingTasks : view === 'in-progress' ? filteredInProgressTasks : filteredCompletedTasks;

  return (
    <div className="space-y-6">
      {canAssignTasks && (
        <section className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 animate-in fade-in slide-in-from-top-4">
          <h2 className="text-xs font-black text-slate-500 mb-3 uppercase tracking-widest flex items-center gap-2">
            <Plus className="w-3 h-3" />
            Assign New Operation
          </h2>
          <form onSubmit={handleAddTask} className="space-y-3">
            <div className="relative">
              <input 
                type="text" 
                value={newTaskDesc}
                onChange={(e) => setNewTaskDesc(e.target.value)}
                placeholder="What needs to be done?"
                className={`w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-800 transition-all placeholder:text-slate-400 pr-12 ${
                  isListening ? 'ring-2 ring-red-500 border-red-300' : ''
                }`}
              />
              <button
                type="button"
                onClick={toggleListening}
                disabled={!isVoiceSupported || isPreparingMicPermission}
                className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-all ${
                  isListening 
                    ? 'bg-red-500 text-white hover:bg-red-600 animate-pulse' 
                    : isPreparingMicPermission
                    ? 'bg-slate-200 text-slate-500 cursor-wait'
                    : isVoiceSupported
                    ? 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900'
                    : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                }`}
                title={
                  !isVoiceSupported
                    ? 'Voice input is not supported on this browser'
                    : isPreparingMicPermission
                    ? 'Preparing microphone permission...'
                    : isListening
                    ? 'Stop recording'
                    : 'Start voice input'
                }
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            </div>

            {isPreparingMicPermission && (
              <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-100 px-3 py-2 rounded-lg">
                <div className="w-2 h-2 bg-slate-500 rounded-full animate-pulse"></div>
                <span>Preparing microphone...</span>
              </div>
            )}
            
            {isListening && (
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                <span>Listening... Speak your task description</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="relative">
                <select
                  value={taskType}
                  onChange={(e) => setTaskType(e.target.value as TaskType)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-800 appearance-none transition-all pr-10"
                >
                  <option value="one_time" className="text-slate-900">One-time Task</option>
                  <option value="recurring" className="text-slate-900">Recurring Task</option>
                </select>
                <Clock className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {taskType === 'recurring' && (
                <div className="relative">
                  <select
                    value={recurrenceFrequency}
                    onChange={(e) => {
                      const value = e.target.value;
                      setRecurrenceFrequency(
                        value === '' ? '' : (value as RecurrenceFrequency)
                      );
                    }}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-800 appearance-none transition-all pr-10"
                    required
                  >
                    <option value="" className="text-slate-900">Select Frequency</option>
                    <option value="daily" className="text-slate-900">Daily</option>
                    <option value="weekly" className="text-slate-900">Weekly</option>
                    <option value="monthly" className="text-slate-900">Monthly</option>
                  </select>
                  <Calendar className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              )}
            </div>
            
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <select 
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-800 appearance-none transition-all pr-10"
                >
                  <option value="none" className="text-slate-900">Anyone / Unassigned</option>
                  {employees.map(emp => (
                      <option key={emp.id} value={emp.id} className="text-slate-900">
                        {emp.name} ({emp.role === 'super_admin' ? 'Super Admin' : emp.role === 'manager' ? 'Manager' : 'Staff'})
                      </option>
                    ))}
                </select>
                <UserPlus className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              
              <div className="relative w-1/3 flex-shrink-0">
                <input 
                  type="datetime-local" 
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full border rounded-xl px-3 py-3 bg-white border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-800 transition-all"
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
                className="w-4 h-4 text-indigo-900 rounded focus:ring-slate-800 border-slate-300"
              />
              <label htmlFor="requirePhoto" className="text-sm text-slate-700">
                Require photo proof
              </label>
            </div>
            
            <div className="flex gap-2">
            <button 
              type="submit"
              disabled={isCreatingTask}
              className="flex-1 bg-indigo-900 hover:bg-indigo-800 text-white py-3 rounded-xl font-bold active:scale-95 transition-all duration-200 flex items-center justify-center gap-2 shadow-sm shadow-[0_2px_8px_rgba(0,0,0,0.04)] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Plus className="w-5 h-5" />
              {isCreatingTask ? 'Assigning...' : 'Assign Task'}
            </button>
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
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-800 appearance-none transition-all pr-10"
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
              ? 'bg-indigo-900 text-white shadow-sm ring-2 ring-slate-300' 
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200 shadow-sm hover:shadow-sm'
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
              ? 'bg-indigo-900 text-white shadow-sm ring-2 ring-slate-300' 
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200 shadow-sm hover:shadow-sm'
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
              ? 'bg-indigo-900 text-white shadow-sm ring-2 ring-slate-300' 
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200 shadow-sm hover:shadow-sm'
          }`}
        >
          <div className="flex items-center justify-center gap-2 py-3 px-2">
            <Calendar className={`w-4 h-4 ${deadlineView === 'upcoming' ? 'text-white' : 'text-indigo-700'}`} />
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
              ? 'bg-indigo-900 text-white shadow-sm ring-2 ring-slate-300' 
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200 shadow-sm hover:shadow-sm'
          }`}
        >
          <div className="flex items-center justify-center gap-2 py-3 px-2">
            <CheckCircle2 className={`w-4 h-4 ${deadlineView === 'all' ? 'text-white' : 'text-emerald-700'}`} />
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
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${view === 'pending' ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-300' : 'text-slate-500'}`}
        >
          <ClipboardIcon className="w-4 h-4" />
          To Do ({filteredPendingTasks.length})
        </button>
        <button 
          onClick={() => setView('in-progress')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${view === 'in-progress' ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-300' : 'text-slate-500'}`}
        >
          <Timer className="w-4 h-4" />
          In Progress ({filteredInProgressTasks.length})
        </button>
        <button 
          onClick={() => setView('completed')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${view === 'completed' ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-300' : 'text-slate-500'}`}
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
            employees={employees}
            currentUser={currentUser}
            onMarkComplete={() => updateTaskStatus(task.id, 'completed')}
            onCompleteWithPhoto={(photoUrl: string) => updateTaskStatus(task.id, 'completed', photoUrl)}
            onStartTask={() => updateTaskStatus(task.id, 'in-progress')}
            onReopenTask={() => updateTaskStatus(task.id, 'pending')}
            onCompleteTaskWithoutPhoto={() => updateTaskStatus(task.id, 'completed')}
            onReassign={() => setReassigningTaskId(task.id)}
            onDelete={() => onDeleteTask(task.id)}
            onDelegate={() => setDelegatingTaskId(task.id)}
            onInlineEditSave={handleInlineTaskUpdate}
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

