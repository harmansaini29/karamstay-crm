const fs = require('fs');

const files = [
  'src/navigation/ManagerTabNavigator.tsx',
  'src/navigation/TenantTabNavigator.tsx'
];

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');

  // Replace using a more robust regex that ignores what is extracted from useTheme
  content = content.replace(
    /const \{[\s\S]*?\} = useTheme\(\);/,
    (match) => match + '\n  const insets = useSafeAreaInsets();'
  );

  fs.writeFileSync(f, content);
  console.log('Fixed insets in', f);
});
