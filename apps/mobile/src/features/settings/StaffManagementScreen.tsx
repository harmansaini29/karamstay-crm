/**
 * StaffManagementScreen.tsx
 *
 * Owner-only screen for managing staff accounts:
 *   • Lists active/inactive staff members
 *   • Add Staff modal: Name, Gmail/Email, password (min 8 chars)
 *   • Deactivate / remove staff
 *   • Role locked to STAFF for all created accounts
 *
 * Routes: POST /staff (create) · GET /staff (list) · PATCH /staff/{id} · DELETE /staff/{id}
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, parseApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { color as semanticColor } from '../../theme/tokens';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { LoadingSkeleton, ErrorState, EmptyState } from '../../components/States';
import { Ionicons } from '@expo/vector-icons';
import { ResponsiveContainer } from '../../components/ResponsiveContainer';

// ─── Types ───────────────────────────────────────────────────────────────────

interface StaffMember {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: { id: number; name: string };
  is_active: boolean;
  assigned_properties: number[];
  created_at: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const StaffManagementScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors, font, space, radius } = useTheme();
  const qc = useQueryClient();

  const [modalVisible, setModalVisible] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: staffList = [], isLoading, isError, error, refetch } = useQuery<StaffMember[]>({
    queryKey: ['staff'],
    queryFn: async () => {
      const res = await apiClient.get('/staff');
      return Array.isArray(res.data) ? res.data : [];
    },
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiClient.post('/staff', payload);
      return res.data;
    },
    onSuccess: async () => {
      await qc.refetchQueries({ queryKey: ['staff'] });
      resetForm();
      setModalVisible(false);
      Alert.alert('Staff Added', 'New staff member has been added and can now log in.');
    },
    onError: (err: any) => Alert.alert('Error', parseApiError(err).message),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      const res = await apiClient.patch(`/staff/${id}`, { is_active });
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
    onError: (err: any) => Alert.alert('Error', parseApiError(err).message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiClient.delete(`/staff/${id}`);
      return res.data;
    },
    onSuccess: async () => {
      await qc.refetchQueries({ queryKey: ['staff'] });
    },
    onError: (err: any) => Alert.alert('Error', parseApiError(err).message),
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  const resetForm = () => {
    setFormName('');
    setFormEmail('');
    setFormPhone('');
    setFormPassword('');
    setFormErrors({});
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!formName.trim() || formName.trim().length < 2) errs.name = 'Full name is required (min 2 chars)';
    if (!formEmail.trim() || !formEmail.includes('@')) errs.email = 'Valid email is required';
    if (!formPhone.trim() || formPhone.trim().length < 10) errs.phone = 'Valid phone number is required';
    if (!formPassword.trim() || formPassword.length < 8) errs.password = 'Password must be at least 8 characters';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreate = () => {
    if (!validate()) return;
    createMutation.mutate({
      name: formName.trim(),
      email: formEmail.trim().toLowerCase(),
      phone: formPhone.trim(),
      // Password is sent to backend; never stored or displayed in state beyond this call
      password: formPassword,
    });
  };

  const handleDelete = useCallback((member: StaffMember) => {
    Alert.alert(
      'Remove Staff Member',
      `Remove ${member.name} from the staff roster? They will lose access immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(member.id),
        },
      ]
    );
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) return <LoadingSkeleton variant="list" />;
  if (isError) return <ErrorState message={parseApiError(error).message} onRetry={refetch} />;

  const renderItem = ({ item }: { item: StaffMember }) => (
    <Card style={[styles.card, { borderColor: colors.border }]}>
      <View style={styles.cardRow}>
        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: colors.primary + '18' }]}>
          <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 16 }}>
            {item.name.charAt(0).toUpperCase()}
          </Text>
        </View>

        {/* Info */}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: font.bodyStrong.fontSize }}>
              {item.name}
            </Text>
            <View
              style={{
                marginLeft: 8,
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 4,
                backgroundColor: item.is_active ? semanticColor.success.bg : colors.border,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '700',
                  color: item.is_active ? semanticColor.success.fg : colors.textMuted,
                }}
              >
                {item.is_active ? 'ACTIVE' : 'INACTIVE'}
              </Text>
            </View>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginTop: 2 }}>
            {item.email}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}>
            {item.phone} · Joined {new Date(item.created_at).toLocaleDateString()}
          </Text>
        </View>

        {/* Actions */}
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <TouchableOpacity
            onPress={() =>
              toggleActiveMutation.mutate({ id: item.id, is_active: !item.is_active })
            }
            style={[
              styles.actionBtn,
              {
                backgroundColor: item.is_active
                  ? semanticColor.warning.bg
                  : semanticColor.success.bg,
                borderColor: item.is_active
                  ? semanticColor.warning.solid + '40'
                  : semanticColor.success.solid + '40',
              },
            ]}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                color: item.is_active ? semanticColor.warning.fg : semanticColor.success.fg,
              }}
            >
              {item.is_active ? 'Deactivate' : 'Reactivate'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleDelete(item)}
            style={[styles.actionBtn, { backgroundColor: semanticColor.error.bg, borderColor: semanticColor.error.solid + '30' }]}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: semanticColor.error.solid }}>
              Remove
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Card>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <ResponsiveContainer>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center' }}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={20} color={colors.primary} />
            <Text style={{ color: colors.primary, marginLeft: space.xs, fontSize: font.body.fontSize }}>
              Back
            </Text>
          </TouchableOpacity>
          <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.h3.fontSize }}>
            Staff Management
          </Text>
          <TouchableOpacity
            onPress={() => {
              resetForm();
              setModalVisible(true);
            }}
            style={{ backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: font.caption.fontSize }}>
              + Add Staff
            </Text>
          </TouchableOpacity>
        </View>

        {/* Stats bar */}
        <View style={[styles.statsRow, { borderBottomColor: colors.border }]}>
          <View style={styles.statItem}>
            <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 22 }}>
              {staffList.length}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>Total Staff</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Text style={{ color: semanticColor.success.solid, fontWeight: '800', fontSize: 22 }}>
              {staffList.filter((s) => s.is_active).length}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>Active</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Text style={{ color: colors.textMuted, fontWeight: '800', fontSize: 22 }}>
              {staffList.filter((s) => !s.is_active).length}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>Inactive</Text>
          </View>
        </View>

        {/* List */}
        {staffList.length === 0 ? (
          <EmptyState
            title="No Staff Members"
            body="No staff members yet. Add your first staff member to grant them portal access."
            ctaLabel="Add Staff"
            onPress={() => {
              resetForm();
              setModalVisible(true);
            }}
          />
        ) : (
          <FlatList
            data={staffList}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            contentContainerStyle={{ padding: space.lg }}
            ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
          />
        )}

        {/* Add Staff Modal */}
        <Modal
          visible={modalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={{ width: '100%' }}
            >
              <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.h3.fontSize }}>
                    Add Staff Member
                  </Text>
                  <TouchableOpacity onPress={() => setModalVisible(false)}>
                    <Ionicons name="close" size={22} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                  {/* Role badge — locked */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, padding: 10, borderRadius: 8, backgroundColor: colors.primary + '10', borderWidth: 1, borderColor: colors.primary + '30' }}>
                    <Ionicons name="lock-closed-outline" size={14} color={colors.primary} style={{ marginRight: 6 }} />
                    <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>
                      Role: STAFF (scoped access — no admin settings)
                    </Text>
                  </View>

                  <Input
                    label="Full Name"
                    value={formName}
                    onChangeText={setFormName}
                    placeholder="e.g. Rohan Verma"
                    error={formErrors.name}
                  />
                  <Input
                    label="Email / Gmail"
                    value={formEmail}
                    onChangeText={setFormEmail}
                    placeholder="staff@example.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    error={formErrors.email}
                  />
                  <Input
                    label="Phone Number"
                    value={formPhone}
                    onChangeText={setFormPhone}
                    placeholder="+91XXXXXXXXXX"
                    keyboardType="phone-pad"
                    error={formErrors.phone}
                  />
                  <Input
                    label="Initial Password"
                    value={formPassword}
                    onChangeText={setFormPassword}
                    placeholder="Min 8 characters"
                    secureTextEntry
                    error={formErrors.password}
                  />

                  <Button
                    label="Create Staff Account"
                    loading={createMutation.isPending}
                    onPress={handleCreate}
                    style={{ marginTop: 16, marginBottom: Platform.OS === 'ios' ? 24 : 8 }}
                  />
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      </ResponsiveContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  statsRow: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, marginVertical: 4 },
  card: {
    borderWidth: 1,
    padding: 14,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
  },
});
