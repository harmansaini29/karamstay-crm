const fs = require('fs');

const files = [
  'src/navigation/StaffTabNavigator.tsx',
  'src/navigation/ManagerTabNavigator.tsx',
  'src/navigation/TenantTabNavigator.tsx'
];

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');

  // Replace using a more robust regex
  content = content.replace(
    /const \{ colors, font \} = useTheme\(\);/,
    'const { colors, font } = useTheme();\n  const insets = useSafeAreaInsets();'
  );

  fs.writeFileSync(f, content);
  console.log('Fixed insets in', f);
});
