import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  SafeAreaView,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppButton, AppCard, AppScreen, Badge } from '../../../components/ui';
import { useAuthStore } from '../../../state/authStore';
import { lumina, radii, spacing, typography } from '../../../theme';
import type { TaskComment } from '../../../types/domain';
import { canAssignTasks } from '../../../utils/roleGuards';
import { useTaskComments, useTaskDetail, tasksKeys } from '../hooks/useTasks';
import { TasksStackParamList } from '../navigation/TasksStack';
import { tasksRepository } from '../repository/tasksRepository';
import { subscribeToTask, subscribeToTaskComments } from '../../../services/sync/taskRealtime';

type TaskDetailsRoute = RouteProp<TasksStackParamList, 'TaskDetails'>;

const statusToBadgeVariant = (
  status: 'pending' | 'in-progress' | 'completed'
): 'warning' | 'info' | 'success' => {
  if (status === 'in-progress') return 'info';
  if (status === 'completed') return 'success';
  return 'warning';
};

const extensionToBadgeVariant = (
  status: 'NONE' | 'REQUESTED' | 'APPROVED' | 'REJECTED'
): 'info' | 'success' | 'danger' | 'warning' => {
  if (status === 'APPROVED') return 'success';
  if (status === 'REJECTED') return 'danger';
  if (status === 'REQUESTED') return 'warning';
  return 'info';
};

const formatDateTime = (timestamp: number | null): string => {
  if (!timestamp) return 'Not set';
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return 'Invalid date';
  }
};

const getRoleBadgeLabel = (role: TaskComment['senderRole']): string | null => {
  if (role === 'super_admin' || role === 'owner') return 'Admin';
  if (role === 'manager') return 'Manager';
  if (role === 'staff') return 'Field Staff';
  return null;
};

export function TaskDetailsScreen() {
  const route = useRoute<TaskDetailsRoute>();
  const navigation = useNavigation<NativeStackNavigationProp<TasksStackParamList>>();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const profile = useAuthStore((state) => state.profile);
  const [draftMessage, setDraftMessage] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [selectedExtensionDate, setSelectedExtensionDate] = useState<Date>(new Date(Date.now() + 86400000));
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const chatListRef = useRef<FlatList<TaskComment>>(null);
  const previousMessageCountRef = useRef(0);
  const isNearBottomRef = useRef(true);

  const taskId = route.params.taskId;
  const userId = profile?.id;

  const { data: task, isLoading: taskLoading, error: taskError } = useTaskDetail(taskId);
  const { data: comments = [], isLoading: commentsLoading } = useTaskComments(taskId);
  const chatMessages = useMemo(() => [...comments].reverse(), [comments]);

  useEffect(() => {
    if (!taskId) return;

    const unsubscribeTask = subscribeToTask(taskId, () => {
      void queryClient.invalidateQueries({ queryKey: tasksKeys.detail(taskId) });
      if (profile?.companyId) {
        void queryClient.invalidateQueries({ queryKey: tasksKeys.byCompany(profile.companyId) });
      }
    });

    const unsubscribeComments = subscribeToTaskComments(taskId, () => {
      void queryClient.invalidateQueries({ queryKey: tasksKeys.comments(taskId) });
    });

    return () => {
      unsubscribeTask();
      unsubscribeComments();
    };
  }, [taskId, profile?.companyId, queryClient]);

  useEffect(() => {
    if (!task?.deadline) return;
    setSelectedExtensionDate(new Date(task.deadline));
  }, [task?.deadline]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      setIsKeyboardOpen(true);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setIsKeyboardOpen(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const scrollToLatest = useCallback(
    (animated: boolean) => {
      chatListRef.current?.scrollToOffset({ offset: 0, animated });
      isNearBottomRef.current = true;
      setShowJumpToLatest(false);
    },
    [setShowJumpToLatest]
  );

  const handleChatScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const isNearBottom = offsetY <= 100;
    isNearBottomRef.current = isNearBottom;

    if (isNearBottom) {
      setShowJumpToLatest(false);
    }
  }, []);

  useEffect(() => {
    const currentCount = chatMessages.length;
    const previousCount = previousMessageCountRef.current;

    if (currentCount === 0) {
      previousMessageCountRef.current = 0;
      setShowJumpToLatest(false);
      return;
    }

    if (previousCount === 0) {
      scrollToLatest(false);
      previousMessageCountRef.current = currentCount;
      return;
    }

    if (currentCount > previousCount) {
      if (isNearBottomRef.current) {
        scrollToLatest(true);
      } else {
        setShowJumpToLatest(true);
      }
    }

    previousMessageCountRef.current = currentCount;
  }, [chatMessages.length, scrollToLatest]);

  const canRequestExtension = useMemo(() => {
    if (!task || !profile) return false;
    const isAssignedUser = task.assignedTo === profile.id;
    const isCompleted = task.status === 'completed';
    const isPendingManagerDecision = task.extensionStatus === 'REQUESTED';
    return isAssignedUser && !isCompleted && !isPendingManagerDecision;
  }, [task, profile]);

  const extensionHelperText = useMemo(() => {
    if (!task || !profile) return '';

    if (task.assignedTo !== profile.id) {
      return 'Only the assigned team member can request extension for this task.';
    }

    if (task.status === 'completed') {
      return 'Task is already completed. Extension is no longer needed.';
    }

    if (task.extensionStatus === 'REQUESTED') {
      return `Extension request is already pending for ${formatDateTime(task.requestedDueDate)}.`;
    }

    if (task.extensionStatus === 'REJECTED') {
      return 'Previous extension was rejected. You can submit a new request.';
    }

    if (task.extensionStatus === 'APPROVED') {
      return 'Current extension is approved. You can request another if timeline changes again.';
    }

    return 'Request a new deadline. Your manager can approve or reject it.';
  }, [task, profile]);

  const canRespondToExtension = useMemo(() => {
    if (!task || !profile) return false;
    const isTaskManager = task.assignedBy === profile.id || canAssignTasks(profile.role);
    return task.extensionStatus === 'REQUESTED' && isTaskManager;
  }, [task, profile]);

  const requestExtensionMutation = useMutation({
    mutationFn: async (requestedDueDate: number) => {
      await tasksRepository.requestExtension(taskId, requestedDueDate);
    },
    onSuccess: () => {
      setPickerVisible(false);
      void queryClient.invalidateQueries({ queryKey: tasksKeys.detail(taskId) });
      if (profile?.companyId) {
        void queryClient.invalidateQueries({ queryKey: tasksKeys.byCompany(profile.companyId) });
      }
    },
  });

  const approveExtensionMutation = useMutation({
    mutationFn: async () => {
      if (!task?.requestedDueDate) {
        throw new Error('No requested due date to approve.');
      }

      await tasksRepository.approveExtension(taskId, task.requestedDueDate);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tasksKeys.detail(taskId) });
      if (profile?.companyId) {
        void queryClient.invalidateQueries({ queryKey: tasksKeys.byCompany(profile.companyId) });
      }
    },
  });

  const rejectExtensionMutation = useMutation({
    mutationFn: async () => {
      await tasksRepository.rejectExtension(taskId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tasksKeys.detail(taskId) });
      if (profile?.companyId) {
        void queryClient.invalidateQueries({ queryKey: tasksKeys.byCompany(profile.companyId) });
      }
    },
  });

  const sendCommentMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!userId) throw new Error('Session not ready.');
      return tasksRepository.sendTaskComment(taskId, userId, text);
    },
    onMutate: async (text) => {
      if (!userId) return undefined;

      const optimistic: TaskComment = {
        id: `temp-${Date.now()}`,
        taskId,
        senderId: userId,
        senderName: profile?.name || 'You',
        senderRole: profile?.role ?? null,
        messageText: text.trim(),
        createdAt: new Date().toISOString(),
        optimistic: true,
      };

      await queryClient.cancelQueries({ queryKey: tasksKeys.comments(taskId) });
      const previous = queryClient.getQueryData<TaskComment[]>(tasksKeys.comments(taskId));
      queryClient.setQueryData<TaskComment[]>(tasksKeys.comments(taskId), (current) => [
        ...(current || []),
        optimistic,
      ]);

      setDraftMessage('');
      setDraftError(null);

      return { previous };
    },
    onError: (_error, _text, context) => {
      if (context?.previous) {
        queryClient.setQueryData(tasksKeys.comments(taskId), context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tasksKeys.comments(taskId) });
    },
  });

  const isMutating =
    requestExtensionMutation.isPending ||
    approveExtensionMutation.isPending ||
    rejectExtensionMutation.isPending ||
    sendCommentMutation.isPending;

  const handleExtensionDateChange = (_event: DateTimePickerEvent, value?: Date) => {
    if (value) setSelectedExtensionDate(value);
  };

  const handleSubmitExtension = () => {
    requestExtensionMutation.mutate(selectedExtensionDate.getTime());
  };

  const handleSendMessage = () => {
    const trimmed = draftMessage.trim();
    if (!trimmed) {
      setDraftError('Message cannot be empty.');
      return;
    }

    sendCommentMutation.mutate(trimmed);
  };

  if (!profile) {
    return (
      <AppScreen>
        <AppCard>
          <Text style={styles.title}>Session not ready.</Text>
          <Text style={styles.subtitle}>Please sign in again.</Text>
        </AppCard>
      </AppScreen>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={18} color={lumina.text.primary} />
        </Pressable>
        <Text style={styles.title}>Task Details</Text>
      </View>

      {taskLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={lumina.action.primary} />
        </View>
      ) : taskError || !task ? (
        <AppCard>
          <Text style={styles.errorTitle}>Failed to load task</Text>
          <Text style={styles.subtitle}>{String((taskError as Error)?.message || 'Task not found')}</Text>
        </AppCard>
      ) : (
        <View style={styles.content}>
          <AppCard style={styles.memoCard}>
            <View style={styles.badgesRow}>
              <Badge label={task.status} variant={statusToBadgeVariant(task.status)} />
              <Badge label={`Extension: ${task.extensionStatus}`} variant={extensionToBadgeVariant(task.extensionStatus)} />
            </View>

            <Text style={styles.memoTitle}>{task.description || 'Untitled task'}</Text>
            <Text style={styles.meta}>Created: {formatDateTime(task.createdAt)}</Text>
            <Text style={styles.meta}>Due: {formatDateTime(task.deadline)}</Text>
          </AppCard>

          {canRequestExtension ? (
            <AppCard style={styles.extensionCard}>
              <Text style={styles.extensionTitle}>Need more time?</Text>
              <Text style={styles.subtitle}>{extensionHelperText}</Text>
              <AppButton
                label="Request Extension"
                onPress={() => setPickerVisible(true)}
                loading={requestExtensionMutation.isPending}
                disabled={isMutating}
                style={styles.extensionButton}
              />
            </AppCard>
          ) : task ? (
            <AppCard style={styles.extensionCard}>
              <Text style={styles.extensionTitle}>Extension</Text>
              <Text style={styles.subtitle}>{extensionHelperText}</Text>
            </AppCard>
          ) : null}

          {pickerVisible ? (
            <AppCard style={styles.extensionCard}>
              <Text style={styles.extensionTitle}>Select requested due date</Text>
              <DateTimePicker
                value={selectedExtensionDate}
                mode="date"
                minimumDate={new Date()}
                onChange={handleExtensionDateChange}
              />
              <View style={styles.extensionActions}>
                <AppButton
                  label="Cancel"
                  onPress={() => setPickerVisible(false)}
                  variant="secondary"
                  style={[styles.flexButton, styles.extensionButton]}
                  disabled={isMutating}
                />
                <AppButton
                  label="Submit"
                  onPress={handleSubmitExtension}
                  style={[styles.flexButton, styles.extensionButton]}
                  loading={requestExtensionMutation.isPending}
                  disabled={isMutating}
                />
              </View>
            </AppCard>
          ) : null}

          {canRespondToExtension ? (
            <AppCard style={styles.extensionCard}>
              <Text style={styles.extensionTitle}>
                Extension requested for {formatDateTime(task.requestedDueDate)}
              </Text>
              <View style={styles.extensionActions}>
                <AppButton
                  label="Approve Extension"
                  onPress={() => approveExtensionMutation.mutate()}
                  loading={approveExtensionMutation.isPending}
                  style={[styles.flexButton, styles.extensionButton]}
                />
                <AppButton
                  label="Reject"
                  onPress={() => rejectExtensionMutation.mutate()}
                  variant="danger"
                  loading={rejectExtensionMutation.isPending}
                  style={[styles.flexButton, styles.extensionButton]}
                />
              </View>
            </AppCard>
          ) : null}

          <AppCard style={styles.chatCard}>
            <Text style={styles.chatTitle}>Task Chat</Text>
            {commentsLoading ? (
              <View style={styles.centered}>
                <ActivityIndicator color={lumina.action.primary} />
              </View>
            ) : (
              <FlatList
                ref={chatListRef}
                data={chatMessages}
                keyExtractor={(item) => item.id}
                style={styles.chatList}
                contentContainerStyle={styles.chatListContent}
                inverted
                keyboardShouldPersistTaps="handled"
                onScroll={handleChatScroll}
                scrollEventThrottle={16}
                renderItem={({ item }) => {
                  const mine = item.senderId === userId;
                  const roleBadge = getRoleBadgeLabel(item.senderRole);
                  return (
                    <View style={[styles.bubbleWrap, mine ? styles.bubbleWrapMine : styles.bubbleWrapTheirs]}>
                      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                        <View style={styles.senderRow}>
                          <Text style={styles.bubbleSender}>{item.senderName}</Text>
                          {roleBadge ? <Text style={styles.roleBadge}>{roleBadge}</Text> : null}
                          {item.optimistic ? <Text style={styles.sendingTag}>Sending...</Text> : null}
                        </View>
                        <Text style={styles.bubbleText}>{item.messageText}</Text>
                        <Text style={styles.bubbleTime}>{formatDateTime(Date.parse(item.createdAt))}</Text>
                      </View>
                    </View>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.emptyChatWrap}>
                    <Text style={styles.subtitle}>No messages yet.</Text>
                  </View>
                }
              />
            )}
            {showJumpToLatest && !isKeyboardOpen ? (
              <Pressable
                style={[styles.newMessageFab, { bottom: Math.max(insets.bottom, spacing.xs) + 64 }]}
                onPress={() => scrollToLatest(true)}
              >
                <Text style={styles.newMessageFabText}>New Message v</Text>
              </Pressable>
            ) : null}

            <View style={[styles.inputWrap, { paddingBottom: Math.max(insets.bottom, spacing.xs) }]}>
              <View style={styles.inputRow}>
                <TextInput
                  value={draftMessage}
                  onChangeText={(value) => {
                    setDraftMessage(value);
                    if (draftError) setDraftError(null);
                  }}
                  placeholder="Type a message..."
                  placeholderTextColor={lumina.text.secondary}
                  style={styles.messageInput}
                  editable={!isMutating}
                />
                <Pressable
                  onPress={handleSendMessage}
                  disabled={isMutating}
                  style={({ pressed }) => [
                    styles.sendButton,
                    pressed && !isMutating ? styles.pressed : undefined,
                    isMutating ? styles.disabled : undefined,
                  ]}
                >
                  <Ionicons name="send" size={18} color={lumina.text.inverse} />
                </Pressable>
              </View>
            </View>
            {draftError ? <Text style={styles.inputError}>{draftError}</Text> : null}
          </AppCard>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: lumina.bg.app,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: lumina.border.subtle,
    backgroundColor: lumina.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: lumina.text.primary,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
  },
  subtitle: {
    color: lumina.text.secondary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: {
    color: lumina.status.danger,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.xs,
  },
  memoCard: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  memoTitle: {
    color: lumina.text.primary,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
  },
  meta: {
    color: lumina.text.secondary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
  extensionCard: {
    marginTop: spacing.sm,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  extensionTitle: {
    color: lumina.text.primary,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  extensionActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  flexButton: {
    flex: 1,
  },
  extensionButton: {
    minHeight: 52,
  },
  chatCard: {
    flex: 1,
    marginTop: spacing.sm,
    paddingBottom: spacing.sm,
    position: 'relative',
  },
  chatTitle: {
    color: lumina.text.primary,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.sm,
  },
  chatList: {
    flex: 1,
  },
  chatListContent: {
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  bubbleWrap: {
    flexDirection: 'row',
  },
  bubbleWrapMine: {
    justifyContent: 'flex-end',
  },
  bubbleWrapTheirs: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '84%',
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: 2,
  },
  bubbleMine: {
    backgroundColor: 'rgba(13,148,136,0.10)',
    borderColor: 'rgba(13,148,136,0.25)',
  },
  bubbleTheirs: {
    backgroundColor: lumina.bg.surface,
    borderColor: lumina.border.subtle,
  },
  bubbleSender: {
    color: lumina.text.secondary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
  senderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  roleBadge: {
    fontSize: 10,
    fontWeight: typography.weight.semibold,
    color: lumina.text.secondary,
    borderColor: lumina.border.subtle,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    textTransform: 'uppercase',
  },
  sendingTag: {
    fontSize: 10,
    fontWeight: typography.weight.medium,
    color: lumina.text.secondary,
  },
  bubbleText: {
    color: lumina.text.primary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
  bubbleTime: {
    color: lumina.text.secondary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
  },
  emptyChatWrap: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  inputWrap: {
    marginTop: spacing.sm,
  },
  newMessageFab: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: lumina.bg.surface,
    borderWidth: 1,
    borderColor: lumina.border.subtle,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    zIndex: 5,
    shadowColor: lumina.shadow.card,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  newMessageFabText: {
    color: lumina.text.primary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  messageInput: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: lumina.border.subtle,
    backgroundColor: lumina.bg.surface,
    color: lumina.text.primary,
    paddingHorizontal: spacing.sm,
    fontSize: typography.size.sm,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: lumina.action.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputError: {
    marginTop: spacing.xs,
    color: lumina.status.danger,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
  },
  pressed: {
    opacity: 0.88,
  },
  disabled: {
    opacity: 0.55,
  },
});
