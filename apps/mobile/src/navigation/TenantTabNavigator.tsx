import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTheme } from '../theme/ThemeProvider';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Platform, StyleSheet, View } from 'react-native';

// Import Screens
import { TenantHomeScreen } from '../features/tenant-home/TenantHomeScreen';
import { TenantPaymentsScreen } from '../features/tenant-home/TenantPaymentsScreen';
import { TenantDocumentsScreen } from '../features/tenant-home/TenantDocumentsScreen';
import { TenantComplaintsScreen } from '../features/tenant-home/TenantComplaintsScreen';
import { TenantProfileScreen } from '../features/tenant-home/TenantProfileScreen';

const Tab = createBottomTabNavigator();

export const TenantTabNavigator: React.FC = () => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

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
      <Tab.Screen name="Home" component={TenantHomeScreen} />
      <Tab.Screen name="Payments" component={TenantPaymentsScreen} />
      <Tab.Screen name="Documents" component={TenantDocumentsScreen} />
      <Tab.Screen name="Complaints" component={TenantComplaintsScreen} />
      <Tab.Screen name="Profile" component={TenantProfileScreen} />
    </Tab.Navigator>
  );
};
