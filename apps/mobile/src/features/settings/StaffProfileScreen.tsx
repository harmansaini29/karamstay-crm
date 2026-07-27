import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity, Alert } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../../theme/ThemeProvider';
import { color as semanticColor } from '../../theme/tokens';
import { Card } from '../../components/Card';
import { apiClient, parseApiError } from '../../api/client';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ResponsiveContainer } from '../../components/ResponsiveContainer';

export const StaffProfileScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors, font, space, radius } = useTheme();
  const { user, logout } = useAuth();

  const [whatsappConsent, setWhatsappConsent] = useState(true);
  const [pushConsent, setPushConsent] = useState(true);

  // Load consents on mount
  useEffect(() => {
    fetchConsents();
  }, []);

  const fetchConsents = async () => {
    try {
      const res = await apiClient.get('/consents/me');
      const consents = res.data || [];
      
      const whatsapp = consents.find((c: any) => c.consent_type === 'whatsapp_notifications');
      if (whatsapp) setWhatsappConsent(whatsapp.granted);
      
      const push = consents.find((c: any) => c.consent_type === 'push_notifications');
      if (push) setPushConsent(push.granted);
    } catch (err) {
      // Ignore or log
    }
  };

  const handleToggleConsent = async (type: 'whatsapp_notifications' | 'push_notifications', currentVal: boolean) => {
    const newVal = !currentVal;
    if (type === 'whatsapp_notifications') setWhatsappConsent(newVal);
    else setPushConsent(newVal);

    try {
      await apiClient.post('/consents', {
        consent_type: type,
        granted: newVal,
        policy_version: '1.0',
      });
    } catch (err: any) {
      Alert.alert('Error', parseApiError(err).message || 'Unable to update consent setting');
      // Rollback UI
      if (type === 'whatsapp_notifications') setWhatsappConsent(currentVal);
      else setPushConsent(currentVal);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <ResponsiveContainer>
      <ScrollView contentContainerStyle={{ padding: space.lg }}>
        <Text style={[styles.title, { color: colors.text, fontSize: font.h1.fontSize }]}>
          Staff Profile
        </Text>
        <Text style={[styles.subtitle, { color: colors.textMuted, fontSize: font.body.fontSize }]}>
          Manage your account credentials and system notifications
        </Text>

        {/* Profile Card */}
        <Card style={[styles.profileCard, { borderColor: colors.border }]}>
          <View style={[styles.avatarCircle, { backgroundColor: colors.primary + '15' }]}>
            <Text style={{ color: colors.primary, fontWeight: 'bold', fontSize: 24 }}>
              {user?.name.slice(0, 2).toUpperCase() || 'ST'}
            </Text>
          </View>
          <View style={{ flex: 1, marginLeft: space.md }}>
            <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.h3.fontSize }}>
              {user?.name || 'Staff User'}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginTop: 2 }}>
              Role: {user?.role.name.toUpperCase()}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize }}>
              {user?.email || user?.phone}
            </Text>
          </View>
        </Card>

        {/* Notification Consents */}
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: font.bodyStrong.fontSize, marginBottom: space.sm }]}>
          Granular Notification Settings
        </Text>
        <Card style={[styles.settingsCard, { borderColor: colors.border, paddingHorizontal: space.md, paddingVertical: space.xs }]}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1, marginRight: space.sm }}>
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: font.body.fontSize }}>
                WhatsApp Alerts
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize }}>
                Receive rent receipts and verification messages on WhatsApp
              </Text>
            </View>
            <Switch
              value={whatsappConsent}
              onValueChange={() => handleToggleConsent('whatsapp_notifications', whatsappConsent)}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={whatsappConsent ? '#FFFFFF' : colors.textMuted}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.switchRow}>
            <View style={{ flex: 1, marginRight: space.sm }}>
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: font.body.fontSize }}>
                Push Alerts
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize }}>
                Receive system updates, ticket alerts, and tasks
              </Text>
            </View>
            <Switch
              value={pushConsent}
              onValueChange={() => handleToggleConsent('push_notifications', pushConsent)}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={pushConsent ? '#FFFFFF' : colors.textMuted}
            />
          </View>
        </Card>

        {/* Data Rights Link */}
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: font.bodyStrong.fontSize, marginBottom: space.sm, marginTop: space.md }]}>
          Privacy & Security
        </Text>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation.navigate('PrivacyData')}
          style={[styles.menuButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={[styles.menuIcon, { backgroundColor: colors.primary + '15' }]}>
            <Ionicons name="shield-outline" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize }}>
              Privacy & Data Rights
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginTop: 2 }}>
              Inspect portable copy or request account deletion
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Logout Button */}
        <TouchableOpacity
          style={[styles.logoutButton, { borderColor: colors.border }]}
          onPress={logout}
        >
          <Ionicons name="log-out-outline" size={20} color={semanticColor.error.solid} style={{ marginRight: space.sm }} />
          <Text style={{ color: semanticColor.error.solid, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize }}>
            Log Out Account
          </Text>
        </TouchableOpacity>
      </ScrollView>
    
      </ResponsiveContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontWeight: 'bold',
  },
  subtitle: {
    marginTop: 2,
    marginBottom: 20,
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
  settingsCard: {
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 16,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  divider: {
    height: 1,
  },
  menuButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 16,
  },
  menuIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
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
