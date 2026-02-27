import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { AppButton, AppCard, AppScreen, Badge } from '../../../components/ui';
import { useAuthStore } from '../../../state/authStore';
import { lumina, radii, spacing, typography } from '../../../theme';
import { approvalsKeys, useApprovalDetail, useApprovalThreads } from '../hooks/useApprovals';
import {
  ApprovalStatus,
  ApprovalThreadMessage,
  approvalsRepository,
} from '../repository/approvalsRepository';
import { ApprovalsStackParamList } from '../navigation/ApprovalsStack';

type DetailsRoute = RouteProp<ApprovalsStackParamList, 'ApprovalDetails'>;

const LOCKED_STATUSES: ApprovalStatus[] = ['APPROVED', 'REJECTED'];

const statusToBadgeVariant = (status: ApprovalStatus): 'warning' | 'info' | 'success' | 'danger' => {
  if (status === 'APPROVED') return 'success';
  if (status === 'REJECTED') return 'danger';
  if (status === 'NEEDS_REVIEW') return 'info';
  return 'warning';
};

const formatAmount = (amount: number): string => {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(amount || 0);
  } catch {
    return `INR ${amount || 0}`;
  }
};

const formatThreadTime = (createdAt: string): string => {
  const value = new Date(createdAt);
  if (!Number.isFinite(value.getTime())) return createdAt;
  return value.toLocaleString();
};

export function ApprovalDetailsScreen() {
  const route = useRoute<DetailsRoute>();
  const navigation = useNavigation<NativeStackNavigationProp<ApprovalsStackParamList>>();
  const queryClient = useQueryClient();
  const profile = useAuthStore((state) => state.profile);
  const [draftMessage, setDraftMessage] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);

  const approvalId = route.params.approvalId;
  const userId = profile?.id;

  const { data: approval, isLoading: approvalLoading, error: approvalError } = useApprovalDetail(approvalId);
  const { data: threads = [], isLoading: threadsLoading } = useApprovalThreads(approvalId);

  const canTakeDecision = useMemo(() => {
    if (!approval || !userId) return false;
    return approval.approverId === userId && !LOCKED_STATUSES.includes(approval.status);
  }, [approval, userId]);

  const updateStatusMutation = useMutation({
    mutationFn: async (status: ApprovalStatus) => {
      await approvalsRepository.updateStatus(approvalId, status);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: approvalsKeys.detail(approvalId) });
      void queryClient.invalidateQueries({ queryKey: approvalsKeys.all });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!userId) throw new Error('Session not ready.');
      return approvalsRepository.insertThreadMessage(approvalId, userId, text);
    },
    onMutate: async (text) => {
      if (!userId) return undefined;

      const optimistic: ApprovalThreadMessage = {
        id: `temp-${Date.now()}`,
        approvalId,
        senderId: userId,
        senderName: profile?.name || 'You',
        messageText: text.trim(),
        createdAt: new Date().toISOString(),
        optimistic: true,
      };

      await queryClient.cancelQueries({ queryKey: approvalsKeys.threads(approvalId) });
      const previous = queryClient.getQueryData<ApprovalThreadMessage[]>(approvalsKeys.threads(approvalId));
      queryClient.setQueryData<ApprovalThreadMessage[]>(approvalsKeys.threads(approvalId), (current) => [
        ...(current || []),
        optimistic,
      ]);
      setDraftMessage('');
      setDraftError(null);

      return { previous };
    },
    onError: (_error, _text, context) => {
      if (context?.previous) {
        queryClient.setQueryData(approvalsKeys.threads(approvalId), context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: approvalsKeys.threads(approvalId) });
    },
  });

  const askReviewMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!userId) throw new Error('Session not ready.');
      await approvalsRepository.requestReviewWithMessage({
        approvalId,
        senderId: userId,
        messageText: text,
      });
    },
    onMutate: async (text) => {
      if (!userId) return undefined;

      const optimistic: ApprovalThreadMessage = {
        id: `temp-review-${Date.now()}`,
        approvalId,
        senderId: userId,
        senderName: profile?.name || 'You',
        messageText: text.trim(),
        createdAt: new Date().toISOString(),
        optimistic: true,
      };

      await queryClient.cancelQueries({ queryKey: approvalsKeys.threads(approvalId) });
      await queryClient.cancelQueries({ queryKey: approvalsKeys.detail(approvalId) });

      const previousThreads = queryClient.getQueryData<ApprovalThreadMessage[]>(
        approvalsKeys.threads(approvalId)
      );
      const previousApproval = queryClient.getQueryData(approvalsKeys.detail(approvalId));

      queryClient.setQueryData<ApprovalThreadMessage[]>(approvalsKeys.threads(approvalId), (current) => [
        ...(current || []),
        optimistic,
      ]);
      queryClient.setQueryData(approvalsKeys.detail(approvalId), (current: any) =>
        current ? { ...current, status: 'NEEDS_REVIEW' } : current
      );

      setDraftMessage('');
      setDraftError(null);

      return { previousThreads, previousApproval };
    },
    onError: (_error, _text, context) => {
      if (context?.previousThreads) {
        queryClient.setQueryData(approvalsKeys.threads(approvalId), context.previousThreads);
      }
      if (context?.previousApproval) {
        queryClient.setQueryData(approvalsKeys.detail(approvalId), context.previousApproval);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: approvalsKeys.detail(approvalId) });
      void queryClient.invalidateQueries({ queryKey: approvalsKeys.threads(approvalId) });
      void queryClient.invalidateQueries({ queryKey: approvalsKeys.all });
    },
  });

  const isBusy =
    updateStatusMutation.isPending || sendMessageMutation.isPending || askReviewMutation.isPending;

  const handleSendMessage = () => {
    const trimmed = draftMessage.trim();
    if (!trimmed) {
      setDraftError('Message cannot be empty.');
      return;
    }
    sendMessageMutation.mutate(trimmed);
  };

  const handleAskForReview = () => {
    const trimmed = draftMessage.trim();
    if (!trimmed) {
      setDraftError('Please type a review note before marking NEEDS_REVIEW.');
      return;
    }
    askReviewMutation.mutate(trimmed);
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
    <AppScreen style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={18} color={lumina.text.primary} />
        </Pressable>
        <Text style={styles.title}>Approval Details</Text>
      </View>

      {approvalLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={lumina.action.primary} />
        </View>
      ) : approvalError || !approval ? (
        <AppCard>
          <Text style={styles.errorTitle}>Failed to load approval</Text>
          <Text style={styles.subtitle}>
            {String((approvalError as Error)?.message || 'Approval not found')}
          </Text>
        </AppCard>
      ) : (
        <>
          <AppCard style={styles.memoCard}>
            <View style={styles.memoHeader}>
              <Text style={styles.memoTitle}>{approval.title || 'Untitled request'}</Text>
              <Badge label={approval.status} variant={statusToBadgeVariant(approval.status)} />
            </View>
            <Text style={styles.amount}>{formatAmount(approval.amount)}</Text>
            <Text style={styles.memoDescription}>{approval.description || 'No description provided.'}</Text>
          </AppCard>

          {canTakeDecision ? (
            <View style={styles.actionsRow}>
              <AppButton
                label="Approve"
                onPress={() => updateStatusMutation.mutate('APPROVED')}
                loading={updateStatusMutation.isPending}
                style={styles.approveButton}
              />
              <AppButton
                label="Reject"
                onPress={() => updateStatusMutation.mutate('REJECTED')}
                loading={updateStatusMutation.isPending}
                variant="danger"
                style={styles.actionButton}
              />
              <AppButton
                label="Ask for Review"
                onPress={handleAskForReview}
                loading={askReviewMutation.isPending}
                style={styles.reviewButton}
              />
            </View>
          ) : null}

          <AppCard style={styles.chatCard}>
            <Text style={styles.chatTitle}>Discussion</Text>
            {threadsLoading ? (
              <View style={styles.centered}>
                <ActivityIndicator color={lumina.action.primary} />
              </View>
            ) : (
              <FlatList
                data={threads}
                keyExtractor={(item) => item.id}
                style={styles.chatList}
                contentContainerStyle={styles.chatListContent}
                renderItem={({ item }) => {
                  const mine = item.senderId === userId;
                  return (
                    <View style={[styles.bubbleWrap, mine ? styles.bubbleWrapMine : styles.bubbleWrapTheirs]}>
                      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                        <Text style={styles.bubbleSender}>
                          {item.senderName}
                          {item.optimistic ? ' (sending...)' : ''}
                        </Text>
                        <Text style={styles.bubbleText}>{item.messageText}</Text>
                        <Text style={styles.bubbleTime}>{formatThreadTime(item.createdAt)}</Text>
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

            <View style={styles.inputRow}>
              <TextInput
                value={draftMessage}
                onChangeText={(value) => {
                  setDraftMessage(value);
                  if (draftError) setDraftError(null);
                }}
                placeholder="Type message..."
                placeholderTextColor={lumina.text.secondary}
                style={styles.messageInput}
                editable={!isBusy}
              />
              <Pressable
                onPress={handleSendMessage}
                disabled={isBusy}
                style={({ pressed }) => [
                  styles.sendButton,
                  pressed && !isBusy ? styles.pressed : undefined,
                  isBusy ? styles.disabled : undefined,
                ]}
              >
                <Ionicons name="send" size={16} color={lumina.text.inverse} />
              </Pressable>
            </View>
            {draftError ? <Text style={styles.inputError}>{draftError}</Text> : null}
          </AppCard>
        </>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
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
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
  },
  errorTitle: {
    color: lumina.status.danger,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.xs,
  },
  memoCard: {
    gap: spacing.sm,
  },
  memoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  memoTitle: {
    flex: 1,
    color: lumina.text.primary,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
  },
  amount: {
    color: lumina.action.primary,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
  },
  memoDescription: {
    color: lumina.text.secondary,
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    lineHeight: 20,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  actionButton: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  approveButton: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    backgroundColor: '#16a34a',
  },
  reviewButton: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    backgroundColor: '#f59e0b',
  },
  chatCard: {
    flex: 1,
    marginTop: spacing.md,
    paddingBottom: spacing.sm,
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
    paddingBottom: spacing.sm,
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
  inputRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  messageInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: lumina.border.subtle,
    backgroundColor: lumina.bg.surface,
    color: lumina.text.primary,
    paddingHorizontal: spacing.sm,
    fontSize: typography.size.sm,
  },
  sendButton: {
    width: 44,
    height: 44,
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
