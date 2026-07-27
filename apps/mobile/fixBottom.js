const fs = require('fs');

const files = [
  'src/navigation/StaffTabNavigator.tsx',
  'src/navigation/ManagerTabNavigator.tsx',
  'src/navigation/TenantTabNavigator.tsx'
];

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');

  // Replace bottom hardcoding to respect insets on Android as well
  content = content.replace(
    /bottom: Platform\.OS === 'ios' \? Math\.max\(insets\.bottom, 16\) : 16,/,
    'bottom: Math.max(insets.bottom, 12) + 12,'
  );

  fs.writeFileSync(f, content);
  console.log('Fixed bottom padding in', f);
});
