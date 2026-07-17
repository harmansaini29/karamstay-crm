import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { Ionicons } from '@expo/vector-icons';

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
  const { colors, font } = useTheme();

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
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
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
