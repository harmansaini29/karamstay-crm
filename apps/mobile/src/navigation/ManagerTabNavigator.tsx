import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { Ionicons } from '@expo/vector-icons';

// Import Screens
import { DashboardScreen } from '../features/dashboard/DashboardScreen';
import { MaintenanceView } from '../features/settings/MaintenanceView';
import { ApprovalsQueueScreen } from '../features/settings/ApprovalsQueueScreen';
import { StaffProfileScreen } from '../features/settings/StaffProfileScreen';
import { PrivacyDataScreen } from '../features/settings/PrivacyDataScreen';
import { PrivacyPolicyScreen, TermsOfServiceScreen } from '../features/auth/StaticWebDocs';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const DashboardStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="DashboardHome" component={DashboardScreen} />
  </Stack.Navigator>
);

const MaintenanceStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="MaintenanceHome" component={MaintenanceView} />
  </Stack.Navigator>
);

const ApprovalsStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="ApprovalsHome" component={ApprovalsQueueScreen} />
  </Stack.Navigator>
);

const ProfileStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="ProfileHome" component={StaffProfileScreen} />
    <Stack.Screen name="PrivacyData" component={PrivacyDataScreen} />
    <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
    <Stack.Screen name="TermsOfService" component={TermsOfServiceScreen} />
  </Stack.Navigator>
);

export const ManagerTabNavigator: React.FC = () => {
  const { colors } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, size }) => {
          let iconName = 'home';
          if (route.name === 'Dashboard') iconName = 'home';
          else if (route.name === 'Maintenance') iconName = 'construct';
          else if (route.name === 'Approvals') iconName = 'checkmark-circle';
          else if (route.name === 'Profile') iconName = 'person';

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
      <Tab.Screen name="Dashboard" component={DashboardStack} />
      <Tab.Screen name="Maintenance" component={MaintenanceStack} />
      <Tab.Screen name="Approvals" component={ApprovalsStack} />
      <Tab.Screen name="Profile" component={ProfileStack} />
    </Tab.Navigator>
  );
};
