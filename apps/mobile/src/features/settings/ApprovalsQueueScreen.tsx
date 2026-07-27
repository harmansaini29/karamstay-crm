import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Modal, TextInput } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, parseApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { color as semanticColor } from '../../theme/tokens';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { LoadingSkeleton, ErrorState, EmptyState } from '../../components/States';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ResponsiveContainer } from '../../components/ResponsiveContainer';

interface PaymentApprovalItem {
  id: number;
  invoice_id: number;
  tenancy_id: number;
  amount: number;
  payment_type: string;
  mode: string;
  status: string;
  utr_number: string;
  submitted_at: string;
}

export const ApprovalsQueueScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors, font, space, radius } = useTheme();
  const queryClient = useQueryClient();

  // Selected payment for rejection modal
  const [selectedPaymentId, setSelectedPaymentId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionModalVisible, setRejectionModalVisible] = useState(false);

  // Query pending payments
  const {
    data: pendingPayments = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<PaymentApprovalItem[]>({
    queryKey: ['pending-payments'],
    queryFn: async () => {
      const res = await apiClient.get('/payments?status=submitted_pending_verification');
      return res.data;
    },
  });

  // Verify mutation
  const verifyPaymentMutation = useMutation({
    mutationFn: async (payload: { id: number; approve: boolean; rejection_reason?: string }) => {
      const { id, approve, rejection_reason } = payload;
      const res = await apiClient.patch(`/payments/${id}/verify`, { approve, rejection_reason });
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pending-payments'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      
      Alert.alert(
        'Payment Verified',
        variables.approve ? 'Payment approved and invoice settled successfully.' : 'Payment rejected.'
      );
    },
    onError: (err: any) => {
      Alert.alert('Verification Failed', parseApiError(err).message || 'Unable to update payment status.');
    },
  });

  const handleApprove = (id: number) => {
    Alert.alert(
      'Confirm Approval',
      'Are you sure you want to approve this UPI payment? Please verify the UTR in your bank ledger first.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          style: 'default',
          onPress: () => {
            verifyPaymentMutation.mutate({ id, approve: true });
          },
        },
      ]
    );
  };

  const handleRejectPress = (id: number) => {
    setSelectedPaymentId(id);
    setRejectionReason('');
    setRejectionModalVisible(true);
  };

  const handleConfirmReject = () => {
    if (!rejectionReason.trim()) {
      Alert.alert('Error', 'Please provide a reason for rejection.');
      return;
    }
    if (selectedPaymentId) {
      verifyPaymentMutation.mutate({
        id: selectedPaymentId,
        approve: false,
        rejection_reason: rejectionReason.trim(),
      });
      setRejectionModalVisible(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const renderApprovalItem = ({ item }: { item: PaymentApprovalItem }) => (
    <Card style={[styles.card, { borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.paymentBadge, { backgroundColor: semanticColor.warning.bg }]}>
          <Text style={{ color: semanticColor.warning.fg, fontWeight: 'bold', fontSize: 11 }}>
            PENDING VERIFICATION
          </Text>
        </View>
        <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize }}>
          {new Date(item.submitted_at).toLocaleDateString()} at {new Date(item.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>

      <View style={styles.body}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.h3.fontSize }}>
            {formatCurrency(item.amount)}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginTop: 4 }}>
            Reference: Inv #{item.invoice_id}
          </Text>
          <View style={[styles.utrBox, { backgroundColor: colors.bg, borderColor: colors.border }]}>
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: font.caption.fontSize }}>
              UTR: {item.utr_number}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          onPress={() => handleRejectPress(item.id)}
          style={[styles.actionBtn, { borderColor: semanticColor.error.solid }]}
        >
          <Ionicons name="close-circle-outline" size={16} color={semanticColor.error.solid} style={{ marginRight: 4 }} />
          <Text style={{ color: semanticColor.error.solid, fontWeight: '600', fontSize: font.caption.fontSize }}>
            Reject
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => handleApprove(item.id)}
          style={[styles.actionBtn, { borderColor: colors.primary, backgroundColor: colors.primary + '10' }]}
        >
          <Ionicons name="checkmark-circle-outline" size={16} color={colors.primary} style={{ marginRight: 4 }} />
          <Text style={{ color: colors.primary, fontWeight: '600', fontSize: font.caption.fontSize }}>
            Approve
          </Text>
        </TouchableOpacity>
      </View>
    </Card>
  );

  if (isLoading) return <LoadingSkeleton variant="list" />;
  if (isError) return <ErrorState message={parseApiError(error).message} onRetry={refetch} />;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <ResponsiveContainer>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: font.h2.fontSize }]}>
          Payment Approvals
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize }}>
          Verify manual UPI transfers via UTR reference numbers
        </Text>
      </View>

      <FlatList
        data={pendingPayments}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderApprovalItem}
        contentContainerStyle={{ padding: space.lg }}
        ListEmptyComponent={
          <EmptyState
            title="Clean Approvals Queue"
            body="No pending UPI payments are awaiting verification currently."
          />
        }
        refreshing={isLoading}
        onRefresh={refetch}
      />

      {/* Rejection Reason Modal */}
      <Modal
        visible={rejectionModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectionModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Card style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.h3.fontSize, marginBottom: space.sm }}>
              Reject Payment
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginBottom: space.md }}>
              Explain why this UTR was rejected so the tenant knows how to fix it (e.g. "Wrong UTR entered", "Amount does not match transfer").
            </Text>

            <TextInput
              style={[styles.reasonInput, { color: colors.text, borderColor: colors.border }]}
              placeholder="Enter rejection feedback..."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={4}
              value={rejectionReason}
              onChangeText={setRejectionReason}
            />

            <View style={styles.modalButtons}>
              <Button
                label="Cancel"
                onPress={() => setRejectionModalVisible(false)}
                variant="secondary"
                style={{ flex: 1, marginRight: space.sm }}
              />
              <Button
                label="Confirm Reject"
                onPress={handleConfirmReject}
                variant="destructive"
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        </View>
      </Modal>
    
      </ResponsiveContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontWeight: 'bold',
  },
  card: {
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  paymentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  utrBox: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginTop: 10,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.1)',
    paddingTop: 12,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    marginLeft: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    padding: 20,
    borderWidth: 1,
  },
  reasonInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    height: 80,
    textAlignVertical: 'top',
    fontSize: 14,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
  },
});
