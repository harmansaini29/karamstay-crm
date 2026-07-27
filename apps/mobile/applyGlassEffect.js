const fs = require('fs');

const files = [
  'src/navigation/StaffTabNavigator.tsx',
  'src/navigation/ManagerTabNavigator.tsx',
  'src/navigation/TenantTabNavigator.tsx'
];

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');

  // Add imports
  if (!content.includes('BlurView')) {
    content = content.replace(
      'import { useSafeAreaInsets } from \'react-native-safe-area-context\';',
      'import { useSafeAreaInsets } from \'react-native-safe-area-context\';\nimport { BlurView } from \'expo-blur\';\nimport { Platform, StyleSheet } from \'react-native\';'
    );
  }

  // Update padding
  content = content.replace(
    'const tabBarBottomPad = Math.max(insets.bottom, 8);',
    'const tabBarBottomPad = Platform.OS === \'ios\' ? Math.max(insets.bottom, 20) : Math.max(insets.bottom, 12);'
  );

  // Update tabBarStyle
  content = content.replace(
    /tabBarStyle: \{[\s\S]*?\},/,
    `tabBarStyle: {
          position: 'absolute',
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.surface,
          borderTopColor: Platform.OS === 'ios' ? 'transparent' : colors.border,
          borderTopWidth: Platform.OS === 'ios' ? 0 : 1,
          height: 55 + tabBarBottomPad,
          paddingBottom: tabBarBottomPad,
          paddingTop: 8,
          elevation: 0,
        },
        tabBarBackground: () =>
          Platform.OS === 'ios' ? (
            <BlurView tint="light" intensity={80} style={StyleSheet.absoluteFill} />
          ) : undefined,`
  );

  fs.writeFileSync(f, content);
  console.log('Fixed', f);
});
