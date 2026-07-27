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
  const insets = useSafeAreaInsets();

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
      <Tab.Screen name="Dashboard" component={DashboardStack} />
      <Tab.Screen name="Maintenance" component={MaintenanceStack} />
      <Tab.Screen name="Approvals" component={ApprovalsStack} />
      <Tab.Screen name="Profile" component={ProfileStack} />
    </Tab.Navigator>
  );
};
