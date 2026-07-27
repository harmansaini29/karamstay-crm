const fs = require('fs');

const files = [
  'src/navigation/StaffTabNavigator.tsx',
  'src/navigation/ManagerTabNavigator.tsx',
  'src/navigation/TenantTabNavigator.tsx'
];

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');

  // Fix the type error by adding 'as any'
  content = content.replace(
    /<Ionicons name=\{iconName\} size=\{20\}/g,
    '<Ionicons name={iconName as any} size={20}'
  );
  content = content.replace(
    /<Ionicons name=\{iconName\} size=\{24\}/g,
    '<Ionicons name={iconName as any} size={24}'
  );

  fs.writeFileSync(f, content);
  console.log('Fixed types in', f);
});
