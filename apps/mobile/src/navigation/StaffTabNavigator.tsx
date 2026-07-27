import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Platform, StyleSheet, View } from 'react-native';

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

import { FinanceHome } from '../features/payments/FinanceHome';
import { InvoiceDetail } from '../features/payments/InvoiceDetail';
import { CreateInvoice } from '../features/payments/CreateInvoice';
import { CreateExpense } from '../features/payments/CreateExpense';
import { LedgerView } from '../features/payments/LedgerView';

import { MoreHome } from '../features/settings/MoreHome';
import { MaintenanceView } from '../features/settings/MaintenanceView';
import { LegalVault } from '../features/settings/LegalVault';
import { NotificationsView } from '../features/settings/NotificationsView';
import { BroadcastNotice } from '../features/settings/BroadcastNotice';
import { SettingsView } from '../features/settings/SettingsView';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Stack wrappers for each Tab
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

const MoreStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="MoreHome" component={MoreHome} />
    <Stack.Screen name="Maintenance" component={MaintenanceView} />
    <Stack.Screen name="LegalVault" component={LegalVault} />
    <Stack.Screen name="Notifications" component={NotificationsView} />
    <Stack.Screen name="BroadcastNotice" component={BroadcastNotice} />
    <Stack.Screen name="Settings" component={SettingsView} />
  </Stack.Navigator>
);

export const StaffTabNavigator: React.FC = () => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, size }) => {
          let iconName = 'home';
          if (route.name === 'Dashboard') iconName = 'home';
          else if (route.name === 'Properties') iconName = 'business';
          else if (route.name === 'Tenants') iconName = 'people';
          else if (route.name === 'Finance') iconName = 'cash';
          else if (route.name === 'More') iconName = 'menu';

          return <Ionicons name={iconName as any} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
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
            <View style={{ flex: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', backgroundColor: colors.surface + 'CC' }}>
              <BlurView tint="default" intensity={80} style={StyleSheet.absoluteFill} />
            </View>
          ) : undefined,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Properties" component={PropertiesStack} />
      <Tab.Screen name="Tenants" component={TenantsStack} />
      <Tab.Screen name="Finance" component={FinanceStack} />
      <Tab.Screen name="More" component={MoreStack} />
    </Tab.Navigator>
  );
};
