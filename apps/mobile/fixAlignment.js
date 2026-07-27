const fs = require('fs');

const files = [
  'src/navigation/StaffTabNavigator.tsx',
  'src/navigation/ManagerTabNavigator.tsx',
  'src/navigation/TenantTabNavigator.tsx'
];

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');

  // We want to replace the width/alignSelf/maxWidth with left/right
  content = content.replace(
    /alignSelf: 'center',\s+width: '90%',\s+maxWidth: 400,/,
    "left: '5%',\n          right: '5%',"
  );

  fs.writeFileSync(f, content);
  console.log('Fixed alignment in', f);
});
