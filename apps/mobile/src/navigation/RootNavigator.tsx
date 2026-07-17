import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../features/auth/AuthContext';
import { useTheme } from '../theme/ThemeProvider';

// Import navigators and screens
import { LoginScreen } from '../features/auth/LoginScreen';
import { OtpScreen } from '../features/auth/OtpScreen';
import { ConsentGateScreen } from '../features/auth/ConsentGateScreen';
import { PrivacyPolicyScreen, TermsOfServiceScreen } from '../features/auth/StaticWebDocs';
import { PrivacyDataScreen } from '../features/settings/PrivacyDataScreen';
import { StaffTabNavigator } from './StaffTabNavigator';
import { ManagerTabNavigator } from './ManagerTabNavigator';
import { TenantTabNavigator } from './TenantTabNavigator';

const Stack = createNativeStackNavigator();

export const RootNavigator: React.FC = () => {
  const { isAuthenticated, isLoading, role, hasAcceptedConsent } = useAuth();
  const { colors } = useTheme();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          // Auth stack
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Otp" component={OtpScreen} />
          </>
        ) : (
          // App stack based on resolved user role & DPDP consent gate status
          <>
            {role === 'tenant' && !hasAcceptedConsent ? (
              <>
                <Stack.Screen name="ConsentGate" component={ConsentGateScreen} />
                <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
                <Stack.Screen name="TermsOfService" component={TermsOfServiceScreen} />
              </>
            ) : (
              <>
                {role === 'tenant' ? (
                  <Stack.Screen name="TenantApp" component={TenantTabNavigator} />
                ) : role === 'manager' ? (
                  <Stack.Screen name="ManagerApp" component={ManagerTabNavigator} />
                ) : (
                  <Stack.Screen name="StaffApp" component={StaffTabNavigator} />
                )}
                {/* Shared screens accessible inside the app */}
                <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
                <Stack.Screen name="TermsOfService" component={TermsOfServiceScreen} />
                <Stack.Screen name="PrivacyData" component={PrivacyDataScreen} />
              </>
            )}
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
