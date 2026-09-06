import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Platform, StyleSheet, View } from 'react-native';
import { useAuth } from '../features/auth/AuthContext';

// Import Screens
import { DashboardScreen } from '../features/dashboard/DashboardScreen';
import { PropertiesList } from '../features/properties/PropertiesList';
import { PropertyDetail } from '../features/properties/PropertyDetail';
import { UnitDetail } from '../features/properties/UnitDetail';
import { PropertyForm } from '../features/properties/PropertyForm';
import { UnitForm } from '../features/properties/UnitForm';

import { TenantsList } from '../features/tenants/TenantsList';
import { TenantDetail } from '../features/tenants/TenantDetail';
import { TenantForm } from '../features/tenants/TenantForm';
import { CheckInForm } from '../features/tenants/CheckInForm';
import { CheckOutForm } from '../features/tenants/CheckOutForm';
import { AgreementWorkspace } from '../features/tenants/AgreementWorkspace';
import { TenantAgreementForm } from '../features/tenants/TenantAgreementForm';

import { FinanceHome } from '../features/payments/FinanceHome';
import { InvoiceDetail } from '../features/payments/InvoiceDetail';
import { CreateInvoice } from '../features/payments/CreateInvoice';
import { CreateExpense } from '../features/payments/CreateExpense';
import { LedgerView } from '../features/payments/LedgerView';

import { MoreHome } from '../features/settings/MoreHome';
import { StaffManagementScreen } from '../features/settings/StaffManagementScreen';
import { MaintenanceView } from '../features/settings/MaintenanceView';
import { LegalVault } from '../features/settings/LegalVault';
import { NotificationsView } from '../features/settings/NotificationsView';
import { BroadcastNotice } from '../features/settings/BroadcastNotice';
import { SettingsView } from '../features/settings/SettingsView';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// ─── Stack wrappers ───────────────────────────────────────────────────────────

// DashboardScreen wrapped in its own stack so all tabs have identical
// navigation depth — prevents the tab bar content container from
// miscomputing its height and showing an opaque fill behind the rounded corners.
const DashboardStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="DashboardHome" component={DashboardScreen} />
  </Stack.Navigator>
);

const PropertiesStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="PropertiesList" component={PropertiesList} />
    <Stack.Screen name="PropertyDetail" component={PropertyDetail} />
    <Stack.Screen name="UnitDetail" component={UnitDetail} />
    <Stack.Screen name="PropertyForm" component={PropertyForm} />
    <Stack.Screen name="UnitForm" component={UnitForm} />
    <Stack.Screen name="CheckInForm" component={CheckInForm} />
    <Stack.Screen name="CheckOutForm" component={CheckOutForm} />
  </Stack.Navigator>
);

const TenantsStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="TenantsList" component={TenantsList} />
    <Stack.Screen name="TenantDetail" component={TenantDetail} />
    <Stack.Screen name="TenantForm" component={TenantForm} />
    <Stack.Screen name="CheckInForm" component={CheckInForm} />
    <Stack.Screen name="CheckOutForm" component={CheckOutForm} />
    <Stack.Screen name="AgreementWorkspace" component={AgreementWorkspace} />
    <Stack.Screen name="TenantAgreementForm" component={TenantAgreementForm} />
  </Stack.Navigator>
);

const FinanceStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="FinanceHome" component={FinanceHome} />
    <Stack.Screen name="InvoiceDetail" component={InvoiceDetail} />
    <Stack.Screen name="CreateInvoice" component={CreateInvoice} />
    <Stack.Screen name="CreateExpense" component={CreateExpense} />
    <Stack.Screen name="Ledger" component={LedgerView} />
  </Stack.Navigator>
);

// AgreementVault tab for staff — exposes LegalVault + AgreementWorkspace only.
// Staff can upload offline photos and review agreement status without Finance access.
const AgreementVaultStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="LegalVault" component={LegalVault} />
    <Stack.Screen name="AgreementWorkspace" component={AgreementWorkspace} />
    <Stack.Screen name="TenantAgreementForm" component={TenantAgreementForm} />
  </Stack.Navigator>
);

const MoreStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="MoreHome" component={MoreHome} />
    <Stack.Screen name="Maintenance" component={MaintenanceView} />
    <Stack.Screen name="LegalVault" component={LegalVault} />
    <Stack.Screen name="Notifications" component={NotificationsView} />
    <Stack.Screen name="BroadcastNotice" component={BroadcastNotice} />
    <Stack.Screen name="Settings" component={SettingsView} />
    <Stack.Screen name="StaffManagement" component={StaffManagementScreen} />
  </Stack.Navigator>
);

// ─── Tab icon map ─────────────────────────────────────────────────────────────

const getTabIcon = (routeName: string): string => {
  switch (routeName) {
    case 'Dashboard': return 'home';
    case 'Properties': return 'business';
    case 'Tenants': return 'people';
    case 'Finance': return 'cash';
    case 'AgreementVault': return 'document-text';
    case 'More': return 'menu';
    default: return 'ellipse-outline';
  }
};

// ─── Navigator ────────────────────────────────────────────────────────────────

export const StaffTabNavigator: React.FC = () => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { role } = useAuth();

  const isStaff = role === 'staff';

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={getTabIcon(route.name) as any} size={size} color={color} />
        ),
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          // position:absolute makes the tab bar float over content (not push it),
          // preventing the ~1-inch white solid fill that appears behind the
          // borderRadius on Android when the bar uses elevation.
          position: 'absolute',
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.surface,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          borderTopWidth: 0,
          elevation: 15,
          shadowColor: '#000',
          shadowOpacity: 0.15,
          shadowRadius: 15,
          shadowOffset: { width: 0, height: -5 },
          height: 64 + Math.max(insets.bottom, 10),
          paddingBottom: Math.max(insets.bottom, 10),
          paddingTop: 8,
        },
        tabBarBackground: () =>
          Platform.OS === 'ios' ? (
            <View
              style={{
                flex: 1,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                overflow: 'hidden',
                backgroundColor: colors.surface + 'CC',
              }}
            >
              <BlurView tint="default" intensity={80} style={StyleSheet.absoluteFill} />
            </View>
          ) : undefined,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardStack} />
      <Tab.Screen name="Properties" component={PropertiesStack} />
      <Tab.Screen name="Tenants" component={TenantsStack} />

      {/* Finance tab: owner/accountant/manager only — hidden for staff */}
      {!isStaff && (
        <Tab.Screen name="Finance" component={FinanceStack} />
      )}

      {/* Staff users get Agreement Vault instead of Finance */}
      {isStaff && (
        <Tab.Screen
          name="AgreementVault"
          component={AgreementVaultStack}
          options={{ tabBarLabel: 'Agreements' }}
        />
      )}

      <Tab.Screen
        name="More"
        component={MoreStack}
        listeners={({ navigation }) => ({
          tabPress: () => {
            navigation.navigate('More', { screen: 'MoreHome' });
          },
        })}
      />
    </Tab.Navigator>
  );
};
