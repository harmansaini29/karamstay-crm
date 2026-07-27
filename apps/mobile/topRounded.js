const fs = require('fs');

const files = [
  'src/navigation/StaffTabNavigator.tsx',
  'src/navigation/ManagerTabNavigator.tsx',
  'src/navigation/TenantTabNavigator.tsx'
];

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');

  // Replace tabBarStyle and tabBarBackground
  const regex = /tabBarStyle: \{[\s\S]*?\},[\s\S]*?tabBarBackground: \(\) =>[\s\S]*?\) : undefined,/m;
  
  const newStyle = `tabBarStyle: {
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
          ) : undefined,`;

  content = content.replace(regex, newStyle);

  fs.writeFileSync(f, content);
  console.log('Fixed bar shape in', f);
});
