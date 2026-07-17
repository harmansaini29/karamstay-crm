import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTheme } from '../theme/ThemeProvider';
import { Ionicons } from '@expo/vector-icons';

// Import Screens
import { TenantHomeScreen } from '../features/tenant-home/TenantHomeScreen';
import { TenantPaymentsScreen } from '../features/tenant-home/TenantPaymentsScreen';
import { TenantDocumentsScreen } from '../features/tenant-home/TenantDocumentsScreen';
import { TenantComplaintsScreen } from '../features/tenant-home/TenantComplaintsScreen';
import { TenantProfileScreen } from '../features/tenant-home/TenantProfileScreen';

const Tab = createBottomTabNavigator();

export const TenantTabNavigator: React.FC = () => {
  const { colors } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, size }) => {
          let iconName = 'home';
          if (route.name === 'Home') iconName = 'home';
          else if (route.name === 'Payments') iconName = 'card';
          else if (route.name === 'Documents') iconName = 'document-text';
          else if (route.name === 'Complaints') iconName = 'construct';
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
      <Tab.Screen name="Home" component={TenantHomeScreen} />
      <Tab.Screen name="Payments" component={TenantPaymentsScreen} />
      <Tab.Screen name="Documents" component={TenantDocumentsScreen} />
      <Tab.Screen name="Complaints" component={TenantComplaintsScreen} />
      <Tab.Screen name="Profile" component={TenantProfileScreen} />
    </Tab.Navigator>
  );
};
