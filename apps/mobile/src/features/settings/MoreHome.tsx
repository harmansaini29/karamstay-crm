import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../../theme/ThemeProvider';
import { Card } from '../../components/Card';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ResponsiveContainer } from '../../components/ResponsiveContainer';

export const MoreHome: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors, font, space, radius } = useTheme();
  const { user, logout } = useAuth();

  const isOwner = user?.role?.name === 'owner';

  const menuItems = [
    {
      title: 'Maintenance Tickets',
      desc: 'View & assign repairs complaints',
      icon: 'construct-outline',
      color: colors.primary,
      onPress: () => navigation.navigate('Maintenance'),
    },
    {
      title: 'Legal Vault (Documents)',
      desc: 'Tenancy leases & property files',
      icon: 'document-text-outline',
      color: '#10B981',
      onPress: () => navigation.navigate('LegalVault'),
    },
    {
      title: 'Notifications Log',
      desc: 'System activity & notification audits',
      icon: 'notifications-outline',
      color: '#3B82F6',
      onPress: () => navigation.navigate('Notifications'),
    },
    ...(isOwner
      ? [
          {
            title: 'Staff Management',
            desc: 'Add, activate & manage staff portal accounts',
            icon: 'people-circle-outline',
            color: '#8B5CF6',
            onPress: () => navigation.navigate('StaffManagement'),
          },
          {
            title: 'Broadcast Notice',
            desc: 'Push updates or SMS notices to tenants',
            icon: 'megaphone-outline',
            color: '#F59E0B',
            onPress: () => navigation.navigate('BroadcastNotice'),
          },
          {
            title: 'Operating Settings',
            desc: 'Configure late fees & templates',
            icon: 'settings-outline',
            color: '#6B7280',
            onPress: () => navigation.navigate('Settings'),
          },
        ]
      : []),
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <ResponsiveContainer>
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 90 }}>
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

          {/* Menu Items */}
          <Text style={[styles.sectionTitle, { color: colors.text, fontSize: font.bodyStrong.fontSize, marginBottom: space.sm }]}>
            Operational Tools
          </Text>

          {menuItems.map((item, i) => (
            <TouchableOpacity
              key={i}
              activeOpacity={0.7}
              onPress={item.onPress}
              style={[styles.menuButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={[styles.menuIcon, { backgroundColor: item.color + '15' }]}>
                <Ionicons name={item.icon as any} size={20} color={item.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: font.bodyStrong.fontSize }}>
                  {item.title}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: font.caption.fontSize, marginTop: 2 }}>
                  {item.desc}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ))}

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
      </ResponsiveContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  menuButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 12,
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
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 24,
    marginBottom: 8,
  },
});
