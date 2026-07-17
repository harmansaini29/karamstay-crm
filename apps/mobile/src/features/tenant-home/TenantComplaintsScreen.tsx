import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, parseApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Toast, LoadingSkeleton, ErrorState, EmptyState } from '../../components/States';
import { Ionicons } from '@expo/vector-icons';

interface Ticket {
  id: number;
  category: string;
  priority: string;
  status: string;
  description: string;
  created_at: string;
}

export const TenantComplaintsScreen: React.FC = () => {
  const { colors, font, space, radius } = useTheme();
  const queryClient = useQueryClient();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  // Form fields
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState('medium');
  const [description, setDescription] = useState('');

  // UI States
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToastMsg(msg);
    setToastType(type);
    setToastVisible(true);
  };

  // Queries
  const { data: tenancyContext } = useQuery<any>({
    queryKey: ['my-tenancy'],
    queryFn: async () => {
      const res = await apiClient.get('/tenancies/me');
      return res.data;
    },
  });

  const {
    data: tickets = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<Ticket[]>({
    queryKey: ['my-tickets'],
    queryFn: async () => {
      const res = await apiClient.get('/maintenance-tickets');
      return res.data;
    },
  });

  const submitTicketMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiClient.post('/maintenance-tickets', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-tickets'] });
      setIsFormOpen(false);
      setCategory('');
      setPriority('medium');
      setDescription('');
      showToast('Complaint ticket filed successfully!', 'success');
    },
    onError: (err: any) => {
      showToast(parseApiError(err).message || 'Submission failed', 'error');
    },
  });

  const handleCreateTicket = () => {
    const newErrors: { [key: string]: string } = {};
    if (!category || category.length < 2 || category.length > 60) {
      newErrors.category = 'Category is required (2-60 characters)';
    }
    if (!description || description.length < 5) {
      newErrors.description = 'Description must be at least 5 characters long';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Use the tenant's REAL unit from their tenancy context — never a hardcoded
    // fallback (the old `|| 1` silently filed every tenant's complaint against unit 1).
    const unitId = tenancyContext?.unit?.id ?? tenancyContext?.unit_id;
    if (unitId == null) {
      setErrors({ category: 'Could not determine your unit. Please reopen the app or contact your manager.' });
      return;
    }

    setErrors({});
    const payload = {
      unit_id: unitId,
      category: category.trim(),
      priority,
      description: description.trim(),
    };

    submitTicketMutation.mutate(payload);
  };

  if (isLoading) return <LoadingSkeleton variant="list" />;
  if (isError) return <ErrorState message={parseApiError(error).message} onRetry={refetch} />;

  const renderTicketItem = ({ item }: { item: Ticket }) => (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => setSelectedTicket(item)}
      style={{ marginBottom: space.sm }}
    >
      <Card style={styles.card}>
        <View style={styles.cardRow}>
          <View style={{ flex: 1, marginRight: space.sm }}>
            <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize }}>
              {item.category}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginTop: 4 }} numberOfLines={1}>
              {item.description}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Badge status={item.status} />
            <Text style={{ color: '#EF4444', fontSize: 10, fontWeight: 'bold', marginTop: 4 }}>
              {item.priority.toUpperCase()}
            </Text>
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );

  const priorityOptions = [
    { label: 'Low Priority', value: 'low' },
    { label: 'Medium Priority', value: 'medium' },
    { label: 'High Priority', value: 'high' },
    { label: 'Urgent Repair', value: 'urgent' },
  ];

  const categoryOptions = [
    { label: 'Plumbing Faults (Leak/Clog)', value: 'Plumbing' },
    { label: 'Electrical Repairs (Switch/Lights)', value: 'Electrical' },
    { label: 'Structural / Carpentry (Door/Lock)', value: 'Structural' },
    { label: 'Appliance Failure (Fridge/AC)', value: 'Appliance' },
    { label: 'WiFi / Internet Issues', value: 'Internet' },
    { label: 'Other Operational Repairs', value: 'Other' },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <Toast message={toastMsg} visible={toastVisible} type={toastType} onDismiss={() => setToastVisible(false)} />
      
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.subtitle, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>
            MAINTENANCE HELP
          </Text>
          <Text style={[styles.titleText, { color: colors.text, fontSize: font.h1.fontSize }]}>
            Complaints
          </Text>
        </View>
        <Button
          label="Raise Ticket"
          onPress={() => setIsFormOpen(true)}
          size="compact"
          style={{ width: 110 }}
        />
      </View>

      {/* Tickets List */}
      <FlatList
        data={tickets}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderTicketItem}
        contentContainerStyle={{ padding: space.lg }}
        ListEmptyComponent={
          <EmptyState
            title="All Clear!"
            body="No complaints filed. Tap 'Raise Ticket' to register a new repair request."
            ctaLabel="Raise Ticket"
            onPress={() => setIsFormOpen(true)}
          />
        }
        refreshing={isLoading}
        onRefresh={refetch}
      />

      {/* Create Modal */}
      <Modal visible={isFormOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text, fontSize: font.h3.fontSize }]}>
                File a Complaint
              </Text>
              <TouchableOpacity onPress={() => setIsFormOpen(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: space.lg }} keyboardShouldPersistTaps="handled">
              <Input
                label="Complaint Category"
                value={category}
                onChangeText={setCategory}
                type="select"
                options={categoryOptions}
                placeholder="Select category"
                error={errors.category}
              />

              <Input
                label="Severity Priority"
                value={priority}
                onChangeText={setPriority}
                type="select"
                options={priorityOptions}
              />

              <Input
                label="Detailed Description"
                value={description}
                onChangeText={setDescription}
                placeholder="e.g. Bathroom sink pipe leaks when tap is open."
                error={errors.description}
                style={{ height: 100 }}
              />

              <Button
                label="File Ticket"
                onPress={handleCreateTicket}
                loading={submitTicketMutation.isPending}
                style={{ marginTop: space.md }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Details Modal */}
      {selectedTicket ? (
        <Modal visible={!!selectedTicket} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text, fontSize: font.h3.fontSize }]}>
                  Ticket Details
                </Text>
                <TouchableOpacity onPress={() => setSelectedTicket(null)}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              <View style={{ padding: space.lg }}>
                <Card style={{ padding: space.md, borderWidth: 1 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: 'bold' }}>CATEGORY</Text>
                  <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize, marginTop: 2 }}>
                    {selectedTicket.category}
                  </Text>

                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: 'bold', marginTop: space.md }}>DESCRIPTION</Text>
                  <Text style={{ color: colors.text, fontSize: font.body.fontSize, marginTop: 2 }}>
                    {selectedTicket.description}
                  </Text>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space.md }}>
                    <View>
                      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: 'bold' }}>PRIORITY</Text>
                      <Text style={{ color: '#EF4444', fontWeight: 'bold', fontSize: font.caption.fontSize, marginTop: 2 }}>
                        {selectedTicket.priority.toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: 'bold' }}>STATUS</Text>
                      <Badge status={selectedTicket.status} style={{ marginTop: 2 }} />
                    </View>
                  </View>
                </Card>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  titleText: {
    fontWeight: 'bold',
  },
  subtitle: {
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  card: {
    borderWidth: 1,
    padding: 12,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    maxHeight: '80%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  modalTitle: {
    fontWeight: 'bold',
  },
});
