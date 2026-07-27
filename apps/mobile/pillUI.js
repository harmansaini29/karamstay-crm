const fs = require('fs');

const files = [
  'src/navigation/StaffTabNavigator.tsx',
  'src/navigation/ManagerTabNavigator.tsx',
  'src/navigation/TenantTabNavigator.tsx'
];

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');

  // Ensure View is imported
  content = content.replace(/import \{.*?\} from 'react-native';/, match => {
    if (!match.includes('View')) {
      return match.replace('{', '{ View,');
    }
    return match;
  });

  const regexStart = /<Tab\.Navigator[\s\S]*?screenOptions=\{\(\{ route \}\) => \(\{/;
  const regexEnd = /\}\)\}[\s\S]*?>[\s\S]*?<Tab\.Screen/;

  const matchStart = content.match(regexStart);
  const matchEnd = content.match(regexEnd);

  if (matchStart && matchEnd) {
    const startIndex = matchStart.index + matchStart[0].length;
    const endIndex = matchEnd.index;
    
    const newOptions = `
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          position: 'absolute',
          bottom: Platform.OS === 'ios' ? Math.max(insets.bottom, 20) : 24,
          alignSelf: 'center',
          width: '85%',
          maxWidth: 400,
          height: 64,
          backgroundColor: '#111111',
          borderRadius: 32,
          elevation: 10,
          shadowColor: '#000',
          shadowOpacity: 0.3,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 5 },
          borderTopWidth: 0,
          paddingBottom: 0,
          paddingTop: 0,
        },
        tabBarBackground: () =>
          Platform.OS === 'ios' ? (
            <View style={{ flex: 1, borderRadius: 32, overflow: 'hidden' }}>
              <BlurView tint="dark" intensity={80} style={StyleSheet.absoluteFill} />
            </View>
          ) : undefined,
        tabBarIcon: ({ focused }) => {
          let iconName = 'home-outline';
          
          if (route.name === 'Dashboard') iconName = focused ? 'home' : 'home-outline';
          else if (route.name === 'Properties') iconName = focused ? 'business' : 'business-outline';
          else if (route.name === 'Tenants') iconName = focused ? 'people' : 'people-outline';
          else if (route.name === 'Finance') iconName = focused ? 'cash' : 'cash-outline';
          else if (route.name === 'More') iconName = focused ? 'menu' : 'menu-outline';
          
          else if (route.name === 'ManagerHome') iconName = focused ? 'home' : 'home-outline';
          else if (route.name === 'Maintenance') iconName = focused ? 'build' : 'build-outline';
          else if (route.name === 'Notices') iconName = focused ? 'megaphone' : 'megaphone-outline';
          else if (route.name === 'Settings') iconName = focused ? 'settings' : 'settings-outline';
          
          else if (route.name === 'Home') iconName = focused ? 'home' : 'home-outline';
          else if (route.name === 'Payments') iconName = focused ? 'card' : 'card-outline';
          else if (route.name === 'Complaints') iconName = focused ? 'alert-circle' : 'alert-circle-outline';
          else if (route.name === 'Documents') iconName = focused ? 'document' : 'document-outline';
          else if (route.name === 'Profile') iconName = focused ? 'person' : 'person-outline';

          return focused ? (
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#6C2BD9', justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name={iconName} size={20} color="#fff" />
            </View>
          ) : (
             <Ionicons name={iconName} size={24} color="#888" />
          );
        },
      `;
      
      const newContent = content.slice(0, startIndex) + newOptions + content.slice(endIndex);
      fs.writeFileSync(f, newContent);
      console.log('Successfully updated', f);
  } else {
    console.log('Could not find regex match in', f);
  }
});
