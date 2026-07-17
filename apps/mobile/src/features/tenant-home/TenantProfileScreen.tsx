import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiClient, parseApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { useAuth } from '../auth/AuthContext';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { LoadingSkeleton, ErrorState } from '../../components/States';
import { Ionicons } from '@expo/vector-icons';

interface TenantProfile {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  date_of_birth: string | null;
  occupation: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  status: string;
}

export const TenantProfileScreen: React.FC = () => {
  const { colors, font, space, mode, setMode } = useTheme();
  const { logout } = useAuth();

  const {
    data: profile,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<TenantProfile>({
    queryKey: ['my-profile'],
    queryFn: async () => {
      const res = await apiClient.get('/tenants/me');
      return res.data;
    },
  });

  if (isLoading) return <LoadingSkeleton variant="detail" />;
  if (isError || !profile) {
    return (
      <ErrorState message={parseApiError(error || new Error('Profile not found')).message} onRetry={refetch} />
    );
  }

  const cycleTheme = () => {
    if (mode === 'light') setMode('dark');
    else if (mode === 'dark') setMode('system');
    else setMode('light');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.subtitle, { color: colors.textMuted, fontSize: font.caption.fontSize }]}>
          PERSONAL ACCOUNT
        </Text>
        <Text style={[styles.titleText, { color: colors.text, fontSize: font.h1.fontSize }]}>
          Profile
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg }}>
        {/* Profile Card */}
        <Card style={[styles.profileCard, { borderColor: colors.border }]}>
          <View style={[styles.avatarCircle, { backgroundColor: colors.primary + '15' }]}>
            <Text style={{ color: colors.primary, fontWeight: 'bold', fontSize: 24 }}>
              {profile.name.slice(0, 2).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1, marginLeft: space.md }}>
            <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.h3.fontSize }}>
              {profile.name}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginTop: 2 }}>
              {profile.phone} {profile.email ? `· ${profile.email}` : ''}
            </Text>
          </View>
        </Card>

        {/* Profile Details */}
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: font.bodyStrong.fontSize, marginBottom: space.sm }]}>
          Personal Details
        </Text>
        
        <Card style={{ borderWidth: 1, marginBottom: space.md }}>
          <View style={styles.gridRow}>
            <View style={styles.gridCol}>
              <Text style={[styles.label, { color: colors.textMuted }]}>Occupation</Text>
              <Text style={[styles.val, { color: colors.text }]}>{profile.occupation || 'Not provided'}</Text>
            </View>
            <View style={styles.gridCol}>
              <Text style={[styles.label, { color: colors.textMuted }]}>Date of Birth</Text>
              <Text style={[styles.val, { color: colors.text }]}>{profile.date_of_birth || 'Not provided'}</Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Text style={[styles.label, { color: colors.textMuted, marginBottom: space.xs }]}>Emergency Contact</Text>
          <Text style={{ color: colors.text, fontWeight: '500', fontSize: font.body.fontSize }}>
            {profile.emergency_contact_name || 'Not provided'}
          </Text>
          {profile.emergency_contact_phone ? (
            <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginTop: 2 }}>
              Phone: {profile.emergency_contact_phone}
            </Text>
          ) : null}
        </Card>

        {/* Theme and Preferences */}
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: font.bodyStrong.fontSize, marginBottom: space.sm }]}>
          Preferences
        </Text>

        <Card style={{ borderWidth: 1, padding: 0 }}>
          <TouchableOpacity
            style={[styles.menuRow, { borderBottomColor: colors.border }]}
            onPress={cycleTheme}
          >
            <Ionicons name="color-palette-outline" size={20} color={colors.primary} style={{ marginRight: space.sm }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: font.body.fontSize }}>
                App Theme
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginTop: 2 }}>
                Current: {mode.toUpperCase()}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </Card>

        {/* Logout Button */}
        <TouchableOpacity
          style={[styles.logoutButton, { borderColor: colors.border }]}
          onPress={logout}
        >
          <Ionicons name="log-out-outline" size={20} color="#EF4444" style={{ marginRight: space.sm }} />
          <Text style={{ color: '#EF4444', fontWeight: 'bold', fontSize: font.bodyStrong.fontSize }}>
            Log Out Account
          </Text>
        </TouchableOpacity>
      </ScrollView>
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
  titleText: {
    fontWeight: 'bold',
  },
  subtitle: {
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    padding: 16,
    marginBottom: 24,
  },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontWeight: 'bold',
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  gridCol: {
    width: '48%',
  },
  label: {
    fontSize: 12,
    marginBottom: 2,
  },
  val: {
    fontWeight: '500',
  },
  divider: {
    height: 1,
    marginVertical: 14,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 24,
  },
});
