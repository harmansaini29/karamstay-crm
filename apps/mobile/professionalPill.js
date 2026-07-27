const fs = require('fs');

const files = [
  'src/navigation/StaffTabNavigator.tsx',
  'src/navigation/ManagerTabNavigator.tsx',
  'src/navigation/TenantTabNavigator.tsx'
];

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');

  // Add imports safely
  content = content.replace(
    'import { Ionicons } from \'@expo/vector-icons\';',
    'import { Ionicons } from \'@expo/vector-icons\';\nimport { useSafeAreaInsets } from \'react-native-safe-area-context\';\nimport { BlurView } from \'expo-blur\';\nimport { Platform, StyleSheet, View } from \'react-native\';'
  );

  // Add insets to the component
  content = content.replace(
    'const { colors, font } = useTheme();\n\n  return (',
    'const { colors, font } = useTheme();\n  const insets = useSafeAreaInsets();\n\n  return ('
  );

  // Replace tabBarStyle exactly
  content = content.replace(
    /tabBarStyle: \{[\s\S]*?\},/,
    `tabBarStyle: {
          position: 'absolute',
          bottom: Platform.OS === 'ios' ? Math.max(insets.bottom, 16) : 16,
          alignSelf: 'center',
          width: '90%',
          maxWidth: 400,
          height: 64,
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.surface,
          borderRadius: 32,
          borderTopWidth: 0,
          elevation: 10,
          shadowColor: '#000',
          shadowOpacity: 0.1,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 5 },
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarBackground: () =>
          Platform.OS === 'ios' ? (
            <View style={{ flex: 1, borderRadius: 32, overflow: 'hidden' }}>
              <BlurView tint="default" intensity={80} style={StyleSheet.absoluteFill} />
            </View>
          ) : undefined,`
  );

  fs.writeFileSync(f, content);
  console.log('Fixed natively', f);
});
