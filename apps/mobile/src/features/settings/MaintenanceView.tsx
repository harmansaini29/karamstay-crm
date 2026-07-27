import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, parseApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { LoadingSkeleton, ErrorState, EmptyState } from '../../components/States';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ResponsiveContainer } from '../../components/ResponsiveContainer';

interface Ticket {
  id: number;
  tenant_id: number;
  unit_id: number;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'completed' | 'closed';
  description: string;
  assigned_to_id: number | null;
  cost: number | null;
  resolved_at: string | null;
  created_at: string;
}

export const MaintenanceView: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors, font, space, radius } = useTheme();
  const queryClient = useQueryClient();

  const [activeFilter, setActiveFilter] = useState<'all' | 'open' | 'in_progress' | 'completed' | 'closed'>('all');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  
  // Update fields
  const [editStatus, setEditStatus] = useState('');
  const [editCost, setEditCost] = useState('');
  const [editAssignee, setEditAssignee] = useState('');

  // Queries
  const {
    data: tickets = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<Ticket[]>({
    queryKey: ['maintenance-tickets'],
    queryFn: async () => {
      const res = await apiClient.get('/maintenance-tickets');
      return res.data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiClient.patch(`/maintenance-tickets/${selectedTicket?.id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-tickets'] });
      setSelectedTicket(null);
      refetch();
    },
    onError: (err: any) => {
      Alert.alert('Update Failed', parseApiError(err).message);
    },
  });

  if (isLoading) return <LoadingSkeleton variant="list" />;
  if (isError) return <ErrorState message={parseApiError(error).message} onRetry={refetch} />;

  // Filter list
  const filteredTickets = tickets.filter(
    (t) => activeFilter === 'all' || t.status === activeFilter
  );

  const getNextTransitions = (status: Ticket['status']) => {
    switch (status) {
      case 'open':
        return ['in_progress', 'closed'];
      case 'in_progress':
        return ['completed', 'open'];
      case 'completed':
        return ['closed', 'in_progress'];
      case 'closed':
      default:
        return [];
    }
  };

  const handleOpenTicketDetails = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setEditStatus(ticket.status);
    setEditCost(ticket.cost ? String(ticket.cost) : '');
    setEditAssignee(ticket.assigned_to_id ? String(ticket.assigned_to_id) : '');
  };

  const handleSaveDetails = () => {
    const costVal = parseFloat(editCost);
    const payload: any = {
      status: editStatus,
      cost: isNaN(costVal) ? null : costVal,
      assigned_to_id: editAssignee ? parseInt(editAssignee) : null,
    };
    updateMutation.mutate(payload);
  };

  const renderTicketItem = ({ item }: { item: Ticket }) => (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => handleOpenTicketDetails(item)}
      style={{ marginBottom: space.sm }}
    >
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize }}>
              {item.category} (Unit {item.unit_id})
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

  const nextTransitions = selectedTicket ? getNextTransitions(selectedTicket.status) : [];
  const statusOptions = [
    { label: selectedTicket?.status || 'Current', value: selectedTicket?.status || '' },
    ...nextTransitions.map((status) => ({
      label: status.replace('_', ' ').toUpperCase(),
      value: status,
    })),
  ];

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      try {
        navigation.navigate('MoreHome');
      } catch (_) {
        navigation.navigate('Dashboard');
      }
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <ResponsiveContainer>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }} onPress={handleBack}>
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
          <Text style={{ color: colors.primary, marginLeft: space.xs, fontSize: font.body.fontSize }}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: font.h3.fontSize }]}>
          Maintenance Tickets
        </Text>
        <View style={{ width: 40 }} />
      </View>


      {/* Filter tabs scroll */}
      <View style={{ height: 48, flexGrow: 0, flexShrink: 0 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterBar}
        >
        {(['all', 'open', 'in_progress', 'completed', 'closed'] as const).map((filter) => (
          <TouchableOpacity
            key={filter}
            onPress={() => setActiveFilter(filter)}
            style={[
              styles.filterTab,
              {
                backgroundColor: activeFilter === filter ? colors.primary + '15' : 'transparent',
                borderColor: activeFilter === filter ? colors.primary : 'transparent',
              },
            ]}
          >
            <Text
              style={{
                color: activeFilter === filter ? colors.primary : colors.textMuted,
                fontWeight: '600',
                textTransform: 'capitalize',
                fontSize: 12,
              }}
            >
              {filter.replace('_', ' ')}
            </Text>
          </TouchableOpacity>
        ))}
        </ScrollView>
      </View>

      {/* Tickets List */}
      <FlatList
        data={filteredTickets}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderTicketItem}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.lg, flexGrow: 1 }}
        ListEmptyComponent={
          <EmptyState
            title="Clean Slate!"
            body="No active maintenance complaints listed for this category."
          />
        }
        refreshing={isLoading}
        onRefresh={refetch}
      />

      {/* Details / Edit Modal */}
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

              <ScrollView contentContainerStyle={{ padding: space.lg }}>
                <Card style={{ marginBottom: space.md, padding: space.md }}>
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: 'bold' }}>CATEGORY & UNIT</Text>
                  <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize, marginTop: 2 }}>
                    {selectedTicket.category} (Unit #{selectedTicket.unit_id})
                  </Text>

                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: 'bold', marginTop: space.sm }}>DESCRIPTION</Text>
                  <Text style={{ color: colors.text, fontSize: font.body.fontSize, marginTop: 2 }}>
                    {selectedTicket.description}
                  </Text>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space.sm }}>
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

                {/* Edit Section */}
                {selectedTicket.status !== 'closed' ? (
                  <View>
                    <Input
                      label="Transition Ticket Status"
                      value={editStatus}
                      onChangeText={setEditStatus}
                      type="select"
                      options={statusOptions}
                    />

                    <Input
                      label="Assigned Contractor ID"
                      value={editAssignee}
                      onChangeText={setEditAssignee}
                      placeholder="e.g. 4"
                      keyboardType="numeric"
                    />

                    <Input
                      label="Resolution Cost (INR)"
                      value={editCost}
                      onChangeText={setEditCost}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                    />

                    <Button
                      label="Update Ticket"
                      onPress={handleSaveDetails}
                      loading={updateMutation.isPending}
                      style={{ marginTop: space.sm }}
                    />
                  </View>
                ) : (
                  <Card style={{ alignItems: 'center', padding: space.md }}>
                    <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize }}>
                      This ticket is closed and cannot be modified.
                    </Text>
                  </Card>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
      </ResponsiveContainer>
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
  headerTitle: {
    fontWeight: 'bold',
  },
  filterBar: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    height: 48,
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 6,
    marginRight: 8,
    height: 32,
    justifyContent: 'center',
  },
  card: {
    borderWidth: 1,
    padding: 14,
  },
  cardHeader: {
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
    maxHeight: '85%',
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
