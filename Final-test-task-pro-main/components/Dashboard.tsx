import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { DealershipTask, Employee, UserRole, TaskStatus, TaskType, RecurrenceFrequency, TaskPriority, TaskRemark } from '../types';
import { supabase } from '../src/lib/supabase';
import { sendTaskCompletionNotification } from '../src/utils/pushNotifications';
import TaskItem from './TaskItem';
import TaskDetailsScreen from './TaskDetailsScreen';
import CompletionModal from './CompletionModal';
import DelegationModal from './DelegationModal';
import ReassignModal from './ReassignModal';
import { Plus, Clock, CheckCircle2, UserPlus, ClipboardList as ClipboardIcon, CalendarClock, Timer, Camera, Bug, User, AlertTriangle, Calendar, Mic, MicOff, Filter, X } from 'lucide-react';
import LoadingButton from '../src/components/ui/LoadingButton';
import TwelveHourTimePicker, { getRoundedFiveMinuteTime } from '../src/components/ui/TwelveHourTimePicker';
import { toast } from 'sonner';

interface DashboardProps {
  tasks: DealershipTask[];
  employees: Employee[];
  currentUser: Employee;
  tasksTabReselectSignal?: number;
  onAddTask: (
    desc: string,
    assignedTo?: string,
    parentTaskId?: string,
    deadline?: number,
    requirePhoto?: boolean,
    taskType?: TaskType,
    recurrenceFrequency?: RecurrenceFrequency | null,
    recurrenceTime?: string | null,
    priority?: TaskPriority
  ) => Promise<void> | void;
  onStartTask: (id: string) => Promise<void> | void;
  onReopenTask: (id: string) => Promise<void> | void;
  onCompleteTask: (id: string, proof: { imageUrl: string, timestamp: number }) => Promise<void> | void;
  onCompleteTaskWithoutPhoto: (id: string) => Promise<void> | void;
  onReassignTask: (taskId: string, newAssigneeId: string) => Promise<void> | void;
  onDeleteTask: (id: string) => Promise<void> | void;
  onUpdateTaskRemarks?: (taskId: string, remarks: TaskRemark[]) => void;
}

type RemarkSubmissionPayload =
  | string
  | {
      text: string;
      mentionedUserIds?: string[];
      mentionedDisplayNames?: string[];
    };

const SEND_MENTION_PUSH_URL = 'https://xdvybqfivmzfddmszqqk.supabase.co/functions/v1/send-mention-push';

const isMissingTaskRecurrenceColumnError = (error: any): boolean => {
  const message = String(error?.message || '').toLowerCase();
  const missingRecurrenceColumn =
    message.includes('recurrence_frequency') || message.includes('task_type') || message.includes('recurrence_time');
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
  delete legacyPayload.recurrence_time;
  delete legacyPayload.taskType;
  delete legacyPayload.recurrenceFrequency;
  delete legacyPayload.recurrenceTime;
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

const isMissingColumnError = (error: any): boolean => {
  const message = String(error?.message || '').toLowerCase();
  return (message.includes('column') && message.includes('does not exist')) || message.includes('schema cache');
};

const DAILY_MS = 24 * 60 * 60 * 1000;
const WEEKLY_MS = 7 * DAILY_MS;
const MONTHLY_MS = 30 * DAILY_MS;

const normalizeRecurrenceTime = (value: string | null | undefined): string | null => {
  const text = String(value || '').trim();
  if (!/^\d{2}:\d{2}$/.test(text)) return null;
  const [hh, mm] = text.split(':').map(Number);
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

const getRecurrenceIntervalMs = (frequency: RecurrenceFrequency | null | undefined): number => {
  if (frequency === 'daily') return DAILY_MS;
  if (frequency === 'weekly') return WEEKLY_MS;
  if (frequency === 'monthly') return MONTHLY_MS;
  return 0;
};

const parseDateToMs = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const direct = Number(value);
    if (Number.isFinite(direct)) return direct;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const Dashboard: React.FC<DashboardProps> = ({ tasks, employees, currentUser, tasksTabReselectSignal = 0, onAddTask, onStartTask, onReopenTask, onCompleteTask, onCompleteTaskWithoutPhoto, onReassignTask, onDeleteTask, onUpdateTaskRemarks }) => {
  type CompletedDateFilter = 'today' | 'yesterday' | 'last7' | 'custom';
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  
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
  const [assigneeId, setAssigneeId] = useState('none');
  const [deadline, setDeadline] = useState('');
  const [requirePhoto, setRequirePhoto] = useState(false);
  const [taskType, setTaskType] = useState<TaskType>('one_time');
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<RecurrenceFrequency | ''>('');
  const [recurrenceTime, setRecurrenceTime] = useState<string>(getRoundedFiveMinuteTime());
  const [priority, setPriority] = useState<TaskPriority>('Medium');
  
  // Clear legacy cached task description so old dictated text is not restored.
  useEffect(() => {
    sessionStorage.removeItem('task_form_desc');
  }, []);

  // Persist form state to sessionStorage (clears when app/browser is closed)
  useEffect(() => {
    sessionStorage.setItem('task_form_assignee', assigneeId);
  }, [assigneeId]);

  useEffect(() => {
    sessionStorage.setItem('task_form_deadline', deadline);
  }, [deadline]);

  useEffect(() => {
    sessionStorage.setItem('task_form_photo', String(requirePhoto));
  }, [requirePhoto]);

  useEffect(() => {
    sessionStorage.setItem('task_form_task_type', taskType);
  }, [taskType]);

  useEffect(() => {
    if (taskType === 'recurring' && recurrenceFrequency) {
      sessionStorage.setItem('task_form_recurrence_frequency', recurrenceFrequency);
      return;
    }
    sessionStorage.removeItem('task_form_recurrence_frequency');
  }, [taskType, recurrenceFrequency]);

  useEffect(() => {
    sessionStorage.setItem('task_form_priority', priority);
  }, [priority]);

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
    setRecurrenceTime(getRoundedFiveMinuteTime());
    setPriority('Medium');
    sessionStorage.removeItem('task_form_desc');
    sessionStorage.removeItem('task_form_assignee');
    sessionStorage.removeItem('task_form_deadline');
    sessionStorage.removeItem('task_form_photo');
    sessionStorage.removeItem('task_form_task_type');
    sessionStorage.removeItem('task_form_recurrence_frequency');
    sessionStorage.removeItem('task_form_priority');
  };
  // Dashboard uses employees from props, no local state needed
  const [selectedPersonFilter, setSelectedPersonFilter] = useState('ALL');
  const [assigneeNameFilter, setAssigneeNameFilter] = useState('');
  const [taskViewFilter, setTaskViewFilter] = useState<'active' | 'completed'>('active');
  const [completedDateFilter, setCompletedDateFilter] = useState<CompletedDateFilter>('today');
  const [completedCustomFromDate, setCompletedCustomFromDate] = useState('');
  const [completedCustomToDate, setCompletedCustomToDate] = useState('');
  const previousTaskIdsRef = useRef<Set<string>>(new Set(tasks.map((task) => task.id)));
  const [showCompletedFilterMenu, setShowCompletedFilterMenu] = useState(false);
  const completedFilterMenuRef = useRef<HTMLDivElement | null>(null);
  
  const syncInputOnPickerClose = (input: HTMLInputElement | null, setter: (value: string) => void) => {
    if (!input) return;
    const tick = () => {
      if (document.activeElement === input) {
        requestAnimationFrame(tick);
      } else {
        setter(input.value);
      }
    };
    requestAnimationFrame(tick);
  };
  
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [delegatingTaskId, setDelegatingTaskId] = useState<string | null>(null);
  const [reassigningTaskId, setReassigningTaskId] = useState<string | null>(null);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const lastTaskSubmitRef = useRef<{ signature: string; timestamp: number } | null>(null);
  const [statusBumpTimestamps, setStatusBumpTimestamps] = useState<Record<string, number>>({});
  const previousTaskStatusRef = useRef<Record<string, TaskStatus>>({});
  const pendingCompletionAutoReturnRef = useRef(false);
  const [taskReadAtById, setTaskReadAtById] = useState<Record<string, number>>({});
  const taskChatReadsTableMissingRef = useRef(false);
  const taskReadStorageKey = useMemo(() => `task-chat-read:${currentUser.id}`, [currentUser.id]);

  const withTimeout = useCallback(<T,>(promise: Promise<T>, ms: number): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Operation timed out')), ms)
      ),
    ]);
  }, []);

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

  const getLocalTaskReadMap = useCallback((): Record<string, number> => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(taskReadStorageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return {};
      const map: Record<string, number> = {};
      Object.entries(parsed).forEach(([taskId, value]) => {
        const ts = parseDateToMs(value);
        if (taskId && ts > 0) {
          map[taskId] = ts;
        }
      });
      return map;
    } catch {
      return {};
    }
  }, [taskReadStorageKey]);

  const saveLocalTaskReadMap = useCallback((next: Record<string, number>) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(taskReadStorageKey, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }, [taskReadStorageKey]);

  useEffect(() => {
    setTaskReadAtById(getLocalTaskReadMap());
  }, [getLocalTaskReadMap]);

  const loadTaskChatReads = useCallback(async (taskIds: string[]) => {
    if (!taskIds.length || taskChatReadsTableMissingRef.current) return;

    const { data, error } = await supabase
      .from('task_chat_reads')
      .select('task_id, last_read_at')
      .eq('user_id', currentUser.id)
      .in('task_id', taskIds);

    if (error) {
      const msg = String(error.message || '').toLowerCase();
      const missingTable =
        (msg.includes('relation') && msg.includes('task_chat_reads')) ||
        (msg.includes('does not exist') && msg.includes('task_chat_reads'));
      if (missingTable) {
        taskChatReadsTableMissingRef.current = true;
        console.warn('task_chat_reads table is missing; unread task badges are disabled until migration is run.');
        return;
      }
      console.warn('Failed to load task chat read state:', error);
      return;
    }

    const localMap = getLocalTaskReadMap();
    const next: Record<string, number> = { ...localMap };
    for (const row of data || []) {
      const taskId = String((row as any).task_id || '');
      if (!taskId) continue;
      next[taskId] = Math.max(next[taskId] || 0, parseDateToMs((row as any).last_read_at));
    }
    setTaskReadAtById((prev) => ({ ...prev, ...next }));
    saveLocalTaskReadMap(next);
  }, [currentUser.id, getLocalTaskReadMap, saveLocalTaskReadMap]);

  const markTaskChatRead = useCallback(async (taskId: string, readAtMs?: number) => {
    if (!taskId || taskChatReadsTableMissingRef.current) return;

    const effectiveReadAtMs = Math.max(readAtMs || 0, Date.now());
    const readAtIso = new Date(effectiveReadAtMs).toISOString();
    setTaskReadAtById((prev) => {
      const merged = { ...prev, [taskId]: Math.max(prev[taskId] || 0, effectiveReadAtMs) };
      saveLocalTaskReadMap(merged);
      return merged;
    });

    const { error } = await supabase
      .from('task_chat_reads')
      .upsert(
        {
          task_id: taskId,
          user_id: currentUser.id,
          last_read_at: readAtIso,
        },
        { onConflict: 'task_id,user_id' }
      );

    if (error) {
      const msg = String(error.message || '').toLowerCase();
      const missingTable =
        (msg.includes('relation') && msg.includes('task_chat_reads')) ||
        (msg.includes('does not exist') && msg.includes('task_chat_reads'));
      if (missingTable) {
        taskChatReadsTableMissingRef.current = true;
        console.warn('task_chat_reads table is missing; unread task badges are disabled until migration is run.');
        return;
      }
      console.warn('Failed to mark task chat as read:', error);
    }
  }, [currentUser.id, saveLocalTaskReadMap]);

  useEffect(() => {
    void loadTaskChatReads(tasks.map((task) => task.id));
  }, [tasks, loadTaskChatReads]);

  useEffect(() => {
    if (taskChatReadsTableMissingRef.current) return;

    const channel = supabase
      .channel(`task-chat-reads-${currentUser.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_chat_reads',
          filter: `user_id=eq.${currentUser.id}`,
        },
        (payload: any) => {
          const taskId = String(payload?.new?.task_id || payload?.old?.task_id || '');
          if (!taskId) return;
          const readAtMs = parseDateToMs(payload?.new?.last_read_at);
          setTaskReadAtById((prev) => {
            const merged = { ...prev, [taskId]: readAtMs || Date.now() };
            saveLocalTaskReadMap(merged);
            return merged;
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUser.id, saveLocalTaskReadMap]);

  const taskUnreadCountById = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const task of tasks) {
      const lastReadAt = taskReadAtById[task.id] || 0;
      const remarks = Array.isArray(task.remarks) ? task.remarks : [];
      counts[task.id] = remarks.reduce((total, remark: any) => {
        const remarkTs = parseDateToMs(remark?.timestamp);
        const senderId = String(remark?.employeeId || '');
        const isOwnMessage =
          senderId === currentUser.id ||
          (currentUser.auth_user_id ? senderId === currentUser.auth_user_id : false);
        if (isOwnMessage) return total;
        return remarkTs > lastReadAt ? total + 1 : total;
      }, 0);
    }
    return counts;
  }, [tasks, taskReadAtById, currentUser.id, currentUser.auth_user_id]);

  const handleOpenTask = (task: DealershipTask) => {
    const latestRemarkMs = (Array.isArray(task.remarks) ? task.remarks : []).reduce((maxTs, remark: any) => {
      const ts = parseDateToMs(remark?.timestamp);
      return Math.max(maxTs, ts);
    }, 0);
    const readAtMs = latestRemarkMs > 0 ? latestRemarkMs + 1 : Date.now();
    setSelectedTaskId(task.id);
    void markTaskChatRead(task.id, readAtMs);
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
      normalizedRecurrenceFrequency || '',
      recurrenceTime || '',
      priority
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
      const normalizedRecurrenceTime: string | null =
        normalizedTaskType === 'recurring' && normalizedRecurrenceFrequency
          ? (normalizeRecurrenceTime(recurrenceTime) || getRoundedFiveMinuteTime())
          : null;

      await withTimeout(
        Promise.resolve(
          onAddTask(
            newTaskDesc.trim(),
            assigneeId === 'none' ? undefined : assigneeId,
            undefined,
            deadlineTimestamp,
            requirePhoto,
            normalizedTaskType,
            normalizedRecurrenceFrequency,
            normalizedRecurrenceTime,
            priority
          )
        ),
        30000
      );

      // IMMEDIATELY reset form states
      setNewTaskDesc('');
      setAssigneeId('none');
      setDeadline('');
      setRequirePhoto(false);
      setTaskType('one_time');
      setRecurrenceFrequency('');
      setRecurrenceTime(getRoundedFiveMinuteTime());
      setPriority('Medium');

      // Auto-reset filter to show new task
      setSelectedPersonFilter('ALL');

      // Reset form and clear sessionStorage
      clearForm();
      
      // Close the modal
      setIsTaskModalOpen(false);
    } catch (err) {
      console.error('Unexpected error creating task:', err);
      if (err instanceof Error && err.message === 'Operation timed out') {
        alert('Request timed out. Please check your connection.');
        return;
      }
      alert('Unexpected Error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsCreatingTask(false);
    }
  };

  const openDateTimePicker = (input: HTMLInputElement | null) => {
    if (!input) return;
    input.focus();
    try {
      (input as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
    } catch {
      // Some browsers block showPicker; focus still allows normal native interaction.
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
      recurrenceTime?: string | null;
      priority: TaskPriority;
    }
  ): Promise<boolean> => {
    const normalizedTaskType: TaskType = updatePayload.taskType === 'recurring' ? 'recurring' : 'one_time';
    const normalizedRecurrenceFrequency: RecurrenceFrequency | null =
      normalizedTaskType === 'recurring' ? updatePayload.recurrenceFrequency : null;
    const normalizedRecurrenceTime: string | null =
      normalizedTaskType === 'recurring' && normalizedRecurrenceFrequency
        ? (normalizeRecurrenceTime(updatePayload.recurrenceTime) || getRoundedFiveMinuteTime())
        : null;

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
      priority: updatePayload.priority === 'High' ? 'High' : 'Medium',
      task_type: normalizedTaskType,
      recurrence_frequency: normalizedRecurrenceFrequency,
      recurrence_time: normalizedRecurrenceTime,
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
      await withTimeout(
        Promise.resolve(
          onAddTask(
            trimmedDescription,
            targetAssigneeId,
            parentTaskId,
            deadlineTimestamp
          )
        ),
        30000
      );

      // Auto-reset filter to show new task
      setSelectedPersonFilter('ALL');
    } catch (err) {
      console.error('🚨 Unexpected error creating delegated task:', err);
      if (err instanceof Error && err.message === 'Operation timed out') {
        alert('Request timed out. Please check your connection.');
        return;
      }
      if (err instanceof Error && err.message === 'Operation timed out') {
        alert('Request timed out. Please check your connection.');
        return;
      }
      alert(`Unexpected Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDelegatingTaskId(null);
    }
  };

  const handleReassign = async (taskId: string, newAssigneeId: string) => {
    try {
      await withTimeout(Promise.resolve(onReassignTask(taskId, newAssigneeId)), 30000);
      setReassigningTaskId(null);
    } catch (err) {
      if (err instanceof Error && err.message === 'Operation timed out') {
        alert('Request timed out. Please check your connection.');
        return;
      }
      alert(`Failed to reassign task: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Update task status in database and local state
  const updateTaskStatus = async (taskId: string, newStatus: 'pending' | 'in-progress' | 'completed', proofUrl?: string) => {
    try {
      if (newStatus === 'in-progress') {
        await withTimeout(Promise.resolve(onStartTask(taskId)), 30000);
        return;
      }

      if (newStatus === 'completed') {
        pendingCompletionAutoReturnRef.current = true;
        if (proofUrl) {
          await withTimeout(
            Promise.resolve(onCompleteTask(taskId, { imageUrl: proofUrl, timestamp: Date.now() })),
            30000
          );
        } else {
          await withTimeout(Promise.resolve(onCompleteTaskWithoutPhoto(taskId)), 30000);
        }
        window.setTimeout(() => {
          pendingCompletionAutoReturnRef.current = false;
        }, 5000);
        return;
      }

      await withTimeout(Promise.resolve(onReopenTask(taskId)), 30000);
      return;
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
              // Fire-and-forget in the background to avoid blocking local state updates
              void (async () => {
                try {
                  const taskCreator = employees.find(emp => emp.id === completedTask?.assignedBy);
                  if (taskCreator) {
                    await sendTaskCompletionNotification(
                      completedTask.description,
                      currentUser.name,
                      taskCreator.id
                    );
                  }
                } catch (notiError) {
                  console.error('Background task completion notification failed:', notiError);
                }
              })();
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
      pendingCompletionAutoReturnRef.current = false;
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
  const handleAddRemark = async (taskId: string, remarkInput: RemarkSubmissionPayload) => {
    try {
      const remarkText =
        typeof remarkInput === 'string'
          ? remarkInput.trim()
          : String(remarkInput?.text || '').trim();
      const mentionedUserIds = Array.from(
        new Set(
          (typeof remarkInput === 'string' ? [] : (remarkInput.mentionedUserIds || []))
            .map((id) => String(id || '').trim())
            .filter(Boolean)
        )
      );
      const mentionedDisplayNames = Array.from(
        new Set(
          (typeof remarkInput === 'string' ? [] : (remarkInput.mentionedDisplayNames || []))
            .map((name) => String(name || '').trim())
            .filter(Boolean)
        )
      );

      if (!remarkText) {
        return;
      }
      
      const newRemarkId = `remark_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newRemark = {
        id: newRemarkId,
        taskId: taskId,
        employeeId: currentUser.id,
        employeeName:
          currentUser.name?.trim() ||
          currentUser.email?.split('@')[0] ||
          'Unknown User',
        remark: remarkText,
        timestamp: Date.now(),
        mentionedUserIds,
        mentionedDisplayNames
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

        const resolvedMentionIds = Array.from(
          new Set([
            ...mentionedUserIds,
            ...mentionedDisplayNames.flatMap((displayName) =>
              employees
                .filter((employee) => String(employee.name || '').trim().toLowerCase() === String(displayName || '').trim().toLowerCase())
                .map((employee) => employee.id)
            ),
          ])
        ).filter((userId) => userId && userId !== currentUser.id);

        if (resolvedMentionIds.length > 0) {
          const actorName =
            currentUser.name?.trim() ||
            currentUser.email?.split('@')[0] ||
            'A teammate';
          const taskTitle = task.description?.trim() || 'Task';
          const companyId = String(currentUser.company_id || task.company_id || '').trim();
          const nowIso = new Date().toISOString();
          const mentionMessage = `${actorName} mentioned you in task: ${taskTitle}`;

          const newSchemaRows = resolvedMentionIds.map((userId) => ({
            employee_id: userId,
            message: mentionMessage,
            company_id: companyId,
            read: false,
            created_at: nowIso,
          }));

          let { error: mentionNotificationError } = await supabase
            .from('notifications')
            .insert(newSchemaRows);

          if (mentionNotificationError && isMissingColumnError(mentionNotificationError)) {
            const fallbackRows = resolvedMentionIds.map((userId) => ({
              user_id: userId,
              title: 'You were mentioned in a task remark',
              body: mentionMessage,
              entity_type: 'task',
              entity_id: taskId,
              is_read: false,
              created_at: nowIso,
            }));

            const fallbackResult = await supabase
              .from('notifications')
              .insert(fallbackRows);
            mentionNotificationError = fallbackResult.error;
          }

          if (mentionNotificationError) {
            console.warn('Mention notification insert failed:', mentionNotificationError);
          } else {
            resolvedMentionIds.forEach((userId) => {
              void fetch(SEND_MENTION_PUSH_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  mentioned_user_id: userId,
                  sender_name: currentUser.name,
                  task_description: task.description,
                  task_id: task.id,
                  company_id: currentUser.company_id
                })
              }).catch((pushError) => {
                console.warn('Mention push dispatch failed:', pushError);
              });
            });
          }
        }
      }
    } catch (err) {
      console.error('🚨 Unexpected error adding remark:', err);
      alert(`Unexpected Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const filterOptions = getFilterOptions();

  // Apply person filter to tasks
  const getFilteredTasks = (tasks: DealershipTask[]) => {
    let filtered = tasks;
    
    // Apply assignee name filter
    if (assigneeNameFilter.trim()) {
      const searchTerm = assigneeNameFilter.toLowerCase().trim();
      filtered = filtered.filter(task => {
        const assignee = employees.find(e => e.id === task.assignedTo);
        const assigneeName = assignee?.name?.toLowerCase() || '';
        return assigneeName.includes(searchTerm);
      });
    }
    
    if (selectedPersonFilter === 'ALL') {
      if (isSuperAdmin) {
        // Super admin sees all tasks when 'ALL' is selected
        return filtered;
      } else {
        // Managers/staff see only their relevant tasks
        return filtered.filter(task => task.assignedTo === currentUser.id || task.assignedBy === currentUser.id);
      }
    }
    
    if (isSuperAdmin) {
      // Super admin can filter by any manager
      return filtered.filter(task => task.assignedBy === selectedPersonFilter);
    } else if (isManager) {
      // Manager filters by assignee
      return filtered.filter(task => task.assignedTo === selectedPersonFilter);
    } else {
      // Staff filters by assigner (manager)
      return filtered.filter(task => task.assignedBy === selectedPersonFilter);
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

  const dayStartMs = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const nowMs = Date.now();
  const todayStartMs = dayStartMs(new Date(nowMs));
  const yesterdayStartMs = todayStartMs - DAILY_MS;

  const customFromStartMs = completedCustomFromDate
    ? dayStartMs(new Date(`${completedCustomFromDate}T00:00:00`))
    : null;
  const customToEndMs = completedCustomToDate
    ? dayStartMs(new Date(`${completedCustomToDate}T00:00:00`)) + DAILY_MS - 1
    : null;

  const isCompletedAtInRange = (completedAtRaw: unknown, rangeStart: number, rangeEnd: number): boolean => {
    const completedMs = parseDateToMs(completedAtRaw);
    return completedMs >= rangeStart && completedMs <= rangeEnd;
  };

  const baseFilteredTasks = getFilteredTasks(tasks);
  const activeTasks = baseFilteredTasks.filter((task) => {
    const status = String(task.status || '').toLowerCase();
    return (
      status === 'pending' ||
      status === 'in_progress' ||
      status === 'in-progress' ||
      status === 'pending_approval' ||
      status === 'pending-approval' ||
      status === 'overdue'
    );
  });
  const completedTasks = baseFilteredTasks
    .filter((task) => String(task.status || '').toLowerCase() === 'completed')
    .sort((a, b) => Number(b.completedAt || 0) - Number(a.completedAt || 0));
  const activeTaskCount = activeTasks.length;
  const completedTaskCount = completedTasks.filter((task) =>
    isCompletedAtInRange(task.completedAt, todayStartMs, nowMs)
  ).length;
  const normalizeStatus = (task: DealershipTask): string =>
    String(task.status || '').toLowerCase().replace(/_/g, '-');
  const statsActiveCount = baseFilteredTasks.filter((task) => normalizeStatus(task) === 'in-progress').length;
  const statsPendingCount = baseFilteredTasks.filter((task) => normalizeStatus(task) === 'pending').length;
  const statsOverdueCount = baseFilteredTasks.filter((task) => {
    const normalized = normalizeStatus(task);
    const isOpen = normalized === 'pending' || normalized === 'in-progress';
    return isOpen && task.deadline != null && Number(task.deadline) < nowMs;
  }).length;
  const statsDoneTodayCount = completedTaskCount;
  const currentHour = new Date().getHours();
  const greetingPrefix =
    currentHour >= 5 && currentHour < 12
      ? 'Good morning,'
      : currentHour >= 12 && currentHour < 17
      ? 'Good afternoon,'
      : currentHour >= 17 && currentHour < 21
      ? 'Good evening,'
      : 'Good night,';

  const completedTasksForView = completedTasks.filter((task) => {
    if (completedDateFilter === 'today') {
      return isCompletedAtInRange(task.completedAt, todayStartMs, nowMs);
    }
    if (completedDateFilter === 'yesterday') {
      return isCompletedAtInRange(task.completedAt, yesterdayStartMs, todayStartMs - 1);
    }
    if (completedDateFilter === 'last7') {
      return isCompletedAtInRange(task.completedAt, todayStartMs - 6 * DAILY_MS, nowMs);
    }
    if (completedDateFilter === 'custom') {
      if (customFromStartMs == null && customToEndMs == null) return true;
      const rangeStart = customFromStartMs ?? Number.MIN_SAFE_INTEGER;
      const rangeEnd = customToEndMs ?? Number.MAX_SAFE_INTEGER;
      return isCompletedAtInRange(task.completedAt, rangeStart, rangeEnd);
    }
    return true;
  });

  const allFilteredTasks =
    taskViewFilter === 'completed' ? completedTasksForView : sortTasksByRecentActivity(activeTasks);
  const completedFilterLabel =
    completedDateFilter === 'today'
      ? 'Today'
      : completedDateFilter === 'yesterday'
      ? 'Yesterday'
      : completedDateFilter === 'last7'
      ? 'Last 7 days'
      : 'Custom range';
  const currentUserFirstName = useMemo(() => {
    const rawName = String(currentUser.name || '').trim();
    if (!rawName) return '';
    return rawName.split(/\s+/)[0] || '';
  }, [currentUser.name]);

  const handleOpenActiveTab = () => {
    setTaskViewFilter('active');
    setShowCompletedFilterMenu(false);
  };

  const handleOpenCompletedTab = () => {
    setTaskViewFilter('completed');
    setCompletedDateFilter('today');
    setCompletedCustomFromDate('');
    setCompletedCustomToDate('');
    setShowCompletedFilterMenu(false);
  };

  useEffect(() => {
    if (!showCompletedFilterMenu) return;
    const handlePointerDownOutside = (event: MouseEvent) => {
      if (!completedFilterMenuRef.current) return;
      const target = event.target as Node;
      if (!completedFilterMenuRef.current.contains(target)) {
        setShowCompletedFilterMenu(false);
      }
    };
    window.addEventListener('mousedown', handlePointerDownOutside);
    return () => window.removeEventListener('mousedown', handlePointerDownOutside);
  }, [showCompletedFilterMenu]);

  // Auto-navigate back if selected task was deleted
  useEffect(() => {
    const previousTaskIds = previousTaskIdsRef.current;
    const currentTaskIds = new Set(tasks.map((task) => task.id));

    if (selectedTaskId && !currentTaskIds.has(selectedTaskId) && previousTaskIds.has(selectedTaskId)) {
      setSelectedTaskId(null);
      toast.info('This task was deleted');
    }

    previousTaskIdsRef.current = currentTaskIds;
  }, [selectedTaskId, tasks]);

  useEffect(() => {
    setSelectedTaskId(null);
  }, [tasksTabReselectSignal]);

  // --- Selected task for detail view ---
  const selectedTask = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) || null : null;

  useEffect(() => {
    if (!pendingCompletionAutoReturnRef.current) {
      return;
    }

    if (!selectedTask) {
      pendingCompletionAutoReturnRef.current = false;
      return;
    }

    const normalizedStatus = String(selectedTask.status || '').toLowerCase();
    if (normalizedStatus === 'completed') {
      pendingCompletionAutoReturnRef.current = false;
      setTaskViewFilter('completed');
      setSelectedTaskId(null);
      return;
    }

    if (normalizedStatus === 'pending_approval') {
      pendingCompletionAutoReturnRef.current = false;
    }
  }, [selectedTask]);

  useEffect(() => {
    if (!selectedTask) return;
    const unread = taskUnreadCountById[selectedTask.id] || 0;
    if (unread <= 0) return;
    const latestRemarkMs = (Array.isArray(selectedTask.remarks) ? selectedTask.remarks : []).reduce((maxTs, remark: any) => {
      const ts = parseDateToMs(remark?.timestamp);
      return Math.max(maxTs, ts);
    }, 0);
    const readAtMs = latestRemarkMs > 0 ? latestRemarkMs + 1 : Date.now();
    void markTaskChatRead(selectedTask.id, readAtMs);
  }, [selectedTask, taskUnreadCountById, markTaskChatRead]);

  // --- If a task is selected, render TaskDetailsScreen ---
  if (selectedTask) {
    return (
      <>
        <TaskDetailsScreen
          task={selectedTask}
          subTasks={tasks.filter(t => t.parentTaskId === selectedTask.id)}
          parentTask={tasks.find(t => t.id === selectedTask.parentTaskId)}
          employees={employees}
          currentUser={currentUser}
          onBack={() => setSelectedTaskId(null)}
          onStartTask={() => updateTaskStatus(selectedTask.id, 'in-progress')}
          onReopenTask={() => updateTaskStatus(selectedTask.id, 'pending')}
          onCompleteTask={(proof) => updateTaskStatus(selectedTask.id, 'completed', proof.imageUrl)}
          onCompleteTaskWithoutPhoto={() => updateTaskStatus(selectedTask.id, 'completed')}
          onReassign={() => setReassigningTaskId(selectedTask.id)}
          onDelegate={() => {
            setSelectedTaskId(null);
            setDelegatingTaskId(selectedTask.id);
          }}
          onDelete={async () => {
            await Promise.resolve(onDeleteTask(selectedTask.id));
            setSelectedTaskId(null);
          }}
          onInlineEditSave={handleInlineTaskUpdate}
          onAddRemark={(taskId, remark) => handleAddRemark(taskId, remark)}
        />

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
      </>
    );
  }

  // --- Otherwise, render the unified task list ---
  return (
    <div className="w-full space-y-4 relative">
      <div className="space-y-1">
        <h2 className="text-[28px] md:text-[30px] font-extrabold text-[var(--ink)] tracking-tight leading-none">
          {currentUserFirstName ? `${greetingPrefix} ${currentUserFirstName}` : greetingPrefix}
        </h2>
        <p className="text-sm text-[var(--ink-3)] mt-1">Here is your task overview for today.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Active', value: statsActiveCount, tone: 'text-[var(--accent)] bg-[var(--accent-light)]' },
          { label: 'Overdue', value: statsOverdueCount, tone: 'text-[var(--red)] bg-[var(--red-light)]' },
          { label: 'Done today', value: statsDoneTodayCount, tone: 'text-[var(--green)] bg-[var(--green-light)]' },
          { label: 'Pending', value: statsPendingCount, tone: 'text-[var(--orange)] bg-[var(--orange-light)]' },
        ].map((item) => (
          <div key={item.label} className={`surface-card px-4 py-3 ${item.tone}`}>
            <div className="font-ui-mono text-[22px] font-medium leading-none">{item.value}</div>
            <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] opacity-80">{item.label}</div>
          </div>
        ))}
      </div>

      {/* Header action */}
      {canAssignTasks && (
        <div className="flex justify-end">
          <button
            onClick={() => setIsTaskModalOpen(true)}
            className="w-full sm:w-auto min-h-[44px] bg-[var(--accent)] hover:bg-[#4338CA] text-white rounded-2xl px-4 py-3 sm:py-3 accent-shadow flex items-center justify-center gap-2 transition-all duration-200 active:scale-95"
          >
            <Plus className="w-5 h-5" />
            <span className="font-bold">New</span>
          </button>
        </div>
      )}

      {/* Task Creation Modal */}
      {isTaskModalOpen && canAssignTasks && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
            onClick={() => !isCreatingTask && setIsTaskModalOpen(false)}
          />
          
          {/* Modal Content */}
          <div className="relative bg-white w-full max-w-lg sm:max-w-xl h-[90vh] sm:h-auto rounded-t-3xl sm:rounded-2xl shadow-xl overflow-y-auto animate-in fade-in zoom-in-95">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-slate-200 p-4 sm:p-5 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-900" />
                Create New Task
              </h2>
              {!isCreatingTask && (
                <button
                  onClick={() => setIsTaskModalOpen(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Form */}
            <form onSubmit={handleAddTask} className="p-4 sm:p-6 space-y-4">
              <div className="relative">
                <input 
                  type="text" 
                  value={newTaskDesc}
                  onChange={(e) => setNewTaskDesc(e.target.value)}
                  placeholder="What needs to be done?"
                  className={`w-full min-h-[48px] bg-white border border-slate-200 rounded-xl px-4 py-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-900 transition-all placeholder:text-slate-400 pr-12 ${
                    isListening ? 'ring-2 ring-red-500 border-red-300' : ''
                  }`}
                  autoFocus
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

	              <div className="flex flex-col gap-2 md:gap-3">
	                <div className="flex flex-col sm:flex-row gap-2 md:flex-nowrap md:items-center md:gap-3">
	                <div className="flex-1 min-w-0 relative">
	                  <select 
	                    value={assigneeId}
	                    onChange={(e) => setAssigneeId(e.target.value)}
	                    className="w-full min-h-[48px] bg-white border border-slate-200 rounded-xl px-4 py-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-900 appearance-none transition-all pr-12 md:min-h-[44px] md:px-3 md:py-2 md:pr-11 md:text-sm"
	                  >
	                    <option value="none" className="text-slate-900">Assign to</option>
	                    {employees.map(emp => (
                        <option key={emp.id} value={emp.id} className="text-slate-900">
                          {emp.name} ({emp.role === 'super_admin' || emp.role === 'owner' ? 'Owner' : emp.role === 'manager' ? 'Manager' : 'Staff'})
                        </option>
                      ))}
	                  </select>
	                  <UserPlus className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
	                </div>
	                
		                <div className="w-full sm:w-1/3 flex-shrink-0 md:w-auto md:flex-1 md:min-w-0">
		                  <div className="flex items-center gap-2 md:min-w-0">
		                    <div className="relative flex-1 min-w-0">
		                      {!deadline && (
		                        <span className="absolute left-3 top-1/2 -translate-y-1/2 pr-10 text-base font-semibold text-slate-500 pointer-events-none md:hidden">
		                          dd-mm-yyyy --:--
		                        </span>
		                      )}
		                      <input 
		                        type="datetime-local" 
		                        value={deadline}
	                        onChange={(e) => setDeadline(e.target.value)}
	                        onInput={(e) => setDeadline(e.currentTarget.value)}
	                        onBlur={(e) => setDeadline(e.currentTarget.value)}
	                        onFocus={(e) => syncInputOnPickerClose(e.currentTarget, setDeadline)}
	                        onClick={(e) => openDateTimePicker(e.currentTarget)}
		                        className="w-full min-h-[48px] border rounded-xl px-3 py-3 bg-white border-slate-200 text-base focus:outline-none focus:ring-2 focus:ring-indigo-900 transition-all cursor-pointer md:min-h-[44px] md:px-3 md:py-2 md:text-sm"
		                      />
		                      <CalendarClock className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
		                    </div>
	                    {deadline && (
	                      <button
	                        type="button"
	                        onClick={() => setDeadline('')}
		                        className="text-slate-400 hover:text-slate-600 text-xs px-2 py-1 rounded-lg border border-slate-200 bg-white whitespace-nowrap md:px-1.5 md:text-[11px]"
		                        aria-label="Clear date"
		                      >
		                        X Clear
		                      </button>
		                    )}
		                  </div>
		                </div>
	                <div className="relative hidden md:block md:flex-1 md:min-w-0">
	                  <select
	                    value={taskType}
	                    onChange={(e) => setTaskType(e.target.value as TaskType)}
	                    className="w-full min-h-[44px] bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-900 appearance-none transition-all pr-10"
	                  >
	                    <option value="one_time" className="text-slate-900">One-time Task</option>
	                    <option value="recurring" className="text-slate-900">Recurring Task</option>
	                  </select>
	                  <Clock className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
	                </div>
	              </div>

	              <div className="grid grid-cols-1 gap-2">
	                <div className="relative md:hidden">
	                  <select
	                    value={taskType}
	                    onChange={(e) => setTaskType(e.target.value as TaskType)}
                    className="w-full min-h-[48px] bg-white border border-slate-200 rounded-xl px-4 py-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-900 appearance-none transition-all pr-10"
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
                      className="w-full min-h-[48px] bg-white border border-slate-200 rounded-xl px-4 py-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-900 appearance-none transition-all pr-10"
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
                {taskType === 'recurring' && recurrenceFrequency && (
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1 block">
                      Resurface time
                    </label>
                    <TwelveHourTimePicker
                      value={recurrenceTime}
                      onChange={setRecurrenceTime}
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="highPriority"
                  checked={priority === 'High'}
                  onChange={(e) => setPriority(e.target.checked ? 'High' : 'Medium')}
                  className="w-5 h-5 text-red-500 rounded focus:ring-red-300 border-slate-300"
                />
                <label htmlFor="highPriority" className="text-sm text-slate-700">
                  Mark as High Priority
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  id="requirePhoto"
                  checked={requirePhoto}
                  onChange={(e) => setRequirePhoto(e.target.checked)}
                  className="w-5 h-5 text-indigo-900 rounded focus:ring-indigo-900 border-slate-300"
                />
                <label htmlFor="requirePhoto" className="text-sm text-slate-700">
                  Require photo proof
                </label>
              </div>
              
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTaskModalOpen(false)}
                  disabled={isCreatingTask}
                  className="flex-1 min-h-[48px] bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl font-semibold transition-all duration-200 disabled:opacity-50"
                >
                  Cancel
                </button>
                <LoadingButton
                  type="submit"
                  isLoading={isCreatingTask}
                  loadingText="Creating..."
                  variant="primary"
                  className="flex-1 min-h-[48px] bg-indigo-900 hover:bg-indigo-800 text-white py-3 rounded-xl font-bold active:scale-95 transition-all duration-200 flex items-center justify-center gap-2 shadow-sm shadow-[0_2px_8px_rgba(0,0,0,0.04)] disabled:opacity-60 disabled:cursor-not-allowed"
	                >
	                  <Plus className="w-5 h-5" />
	                  Create Task
	                </LoadingButton>
	              </div>
	            </div>
	            </form>
          </div>
        </div>
      )}

      {/* Assignee Name Filter */}
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          <Filter className="w-4 h-4" />
        </div>
        <input
          type="text"
          value={assigneeNameFilter}
          onChange={(e) => setAssigneeNameFilter(e.target.value)}
          placeholder="Filter by assignee name..."
          className="w-full min-h-[48px] bg-white border border-[var(--border)] rounded-xl pl-10 pr-4 py-3 text-base text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 transition-all placeholder:text-[var(--ink-3)] shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
        />
        {assigneeNameFilter && (
          <button
            onClick={() => setAssigneeNameFilter('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Task Status Toggle */}
      <div className="mt-3 flex items-center gap-2 pill-shell p-1.5">
        <button
          type="button"
          onClick={handleOpenActiveTab}
          className={`flex-1 min-h-[44px] rounded-[999px] px-4 py-2 text-sm font-bold transition-all flex items-center justify-center gap-2 ${
            taskViewFilter === 'active'
              ? 'pill-active text-[var(--accent)]'
              : 'text-[var(--ink-3)] hover:bg-white/60'
          }`}
        >
          <span>Active</span>
          <span className="font-ui-mono inline-flex min-w-[22px] h-[22px] px-1.5 items-center justify-center rounded-full bg-[var(--accent)] text-white text-[11px] font-medium leading-none">
            {activeTaskCount}
          </span>
        </button>
        <button
          type="button"
          onClick={handleOpenCompletedTab}
          className={`flex-1 min-h-[44px] rounded-[999px] px-4 py-2 text-sm font-bold transition-all flex items-center justify-center gap-2 ${
            taskViewFilter === 'completed'
              ? 'pill-active text-[var(--green)]'
              : 'text-[var(--ink-3)] hover:bg-white/60'
          }`}
        >
          <span>Completed</span>
          <span className="font-ui-mono inline-flex min-w-[22px] h-[22px] px-1.5 items-center justify-center rounded-full bg-[var(--green)] text-white text-[11px] font-medium leading-none">
            {completedTaskCount}
          </span>
        </button>
      </div>

      {taskViewFilter === 'completed' && (
        <div className="flex justify-end mt-2">
          <div className="relative" ref={completedFilterMenuRef}>
            <button
              type="button"
              onClick={() => setShowCompletedFilterMenu((previous) => !previous)}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--ink-2)] hover:bg-slate-50 transition-colors shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>{completedFilterLabel}</span>
            </button>

            {showCompletedFilterMenu && (
              <div className="absolute right-0 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-lg z-20 space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setCompletedDateFilter('today');
                    setShowCompletedFilterMenu(false);
                  }}
                  className={`w-full text-left rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    completedDateFilter === 'today' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCompletedDateFilter('yesterday');
                    setShowCompletedFilterMenu(false);
                  }}
                  className={`w-full text-left rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    completedDateFilter === 'yesterday' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Yesterday
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCompletedDateFilter('last7');
                    setShowCompletedFilterMenu(false);
                  }}
                  className={`w-full text-left rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    completedDateFilter === 'last7' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Last 7 days
                </button>
                <button
                  type="button"
                  onClick={() => setCompletedDateFilter('custom')}
                  className={`w-full text-left rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    completedDateFilter === 'custom' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Custom range
                </button>

                {completedDateFilter === 'custom' && (
                  <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2 space-y-2">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">From</label>
	                      <div className="flex items-center gap-2">
	                        <input
	                          type="date"
	                          value={completedCustomFromDate}
	                          onChange={(event) => setCompletedCustomFromDate(event.target.value)}
	                          onInput={(event) => setCompletedCustomFromDate(event.currentTarget.value)}
	                          onBlur={(event) => setCompletedCustomFromDate(event.currentTarget.value)}
	                          onFocus={(event) => syncInputOnPickerClose(event.currentTarget, setCompletedCustomFromDate)}
	                          className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-900"
	                        />
	                        {completedCustomFromDate && (
	                          <button
	                            type="button"
	                            onClick={() => setCompletedCustomFromDate('')}
	                            className="text-slate-400 hover:text-slate-600 text-xs px-2 py-1 rounded-lg border border-slate-200 bg-white whitespace-nowrap"
	                            aria-label="Clear date"
	                          >
	                            X Clear
	                          </button>
	                        )}
	                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">To</label>
	                      <div className="flex items-center gap-2">
	                        <input
	                          type="date"
	                          value={completedCustomToDate}
	                          onChange={(event) => setCompletedCustomToDate(event.target.value)}
	                          onInput={(event) => setCompletedCustomToDate(event.currentTarget.value)}
	                          onBlur={(event) => setCompletedCustomToDate(event.currentTarget.value)}
	                          onFocus={(event) => syncInputOnPickerClose(event.currentTarget, setCompletedCustomToDate)}
	                          className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-900"
	                        />
	                        {completedCustomToDate && (
	                          <button
	                            type="button"
	                            onClick={() => setCompletedCustomToDate('')}
	                            className="text-slate-400 hover:text-slate-600 text-xs px-2 py-1 rounded-lg border border-slate-200 bg-white whitespace-nowrap"
	                            aria-label="Clear date"
	                          >
	                            X Clear
	                          </button>
	                        )}
	                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Unified Task List */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-8 min-h-[500px]">
        {allFilteredTasks.map(task => (
          <TaskItem 
            key={task.id} 
            task={task} 
            employees={employees}
            unreadCount={taskUnreadCountById[task.id] || 0}
            onClick={() => handleOpenTask(task)}
            showCompletedMeta={taskViewFilter === 'completed'}
          />
        ))}
        {allFilteredTasks.length === 0 && (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-[var(--border)] md:col-span-2 xl:col-span-3">
            <ClipboardIcon className="w-12 h-12 mx-auto mb-3 text-slate-200" />
            <p className="text-slate-400 font-bold">No tasks found.</p>
          </div>
        )}
      </div>

      {completingTaskId && (
        <CompletionModal 
          onClose={() => setCompletingTaskId(null)}
          onConfirm={async (photo) => {
            try {
              await withTimeout(
                Promise.resolve(onCompleteTask(completingTaskId, { imageUrl: photo, timestamp: Date.now() })),
                30000
              );
              setCompletingTaskId(null);
            } catch (err) {
              if (err instanceof Error && err.message === 'Operation timed out') {
                alert('Request timed out. Please check your connection.');
                return;
              }
              alert(`Failed to complete task: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
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
