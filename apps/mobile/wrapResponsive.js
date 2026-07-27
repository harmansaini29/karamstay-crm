const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.tsx')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('./src/features');
let wrappedCount = 0;

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');

  // Skip if already has ResponsiveContainer or doesn't have SafeAreaView
  if (content.includes('ResponsiveContainer') || !content.includes('<SafeAreaView')) return;

  console.log('Wrapping:', f);

  // 1. Add import
  const safeAreaImport = "import { SafeAreaView } from 'react-native-safe-area-context';";
  
  // Calculate relative path depth
  const depth = f.split(path.sep).length - 2; // src/features/settings/File.tsx -> depth=2
  const rel = depth === 2 ? '../../' : (depth === 1 ? '../' : '../../../');
  
  const newImport = safeAreaImport + "\nimport { ResponsiveContainer } from '" + rel + "components/ResponsiveContainer';";
  content = content.replace(safeAreaImport, newImport);

  // 2. Wrap content
  // Find <SafeAreaView ...>
  const openTagMatch = content.match(/<SafeAreaView[^>]*>/);
  if (openTagMatch) {
    const openIndex = openTagMatch.index + openTagMatch[0].length;
    content = content.slice(0, openIndex) + '\n      <ResponsiveContainer>' + content.slice(openIndex);
  }

  // Find last </SafeAreaView>
  const closeIndex = content.lastIndexOf('</SafeAreaView>');
  if (closeIndex !== -1) {
    content = content.slice(0, closeIndex) + '\n      </ResponsiveContainer>\n    ' + content.slice(closeIndex);
  }

  // Specific MaintenanceView fixes
  if (f.includes('MaintenanceView.tsx')) {
    content = content.replace(
      '<ScrollView\n        horizontal\n        showsHorizontalScrollIndicator={false}\n        contentContainerStyle={styles.filterBar}\n      >',
      '<View style={{ height: 48, flexGrow: 0, flexShrink: 0 }}>\n        <ScrollView\n          horizontal\n          showsHorizontalScrollIndicator={false}\n          contentContainerStyle={styles.filterBar}\n        >'
    );
    content = content.replace(
      '        ))}\n      </ScrollView>',
      '        ))}\n        </ScrollView>\n      </View>'
    );
    content = content.replace(
      'contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.lg }}',
      'contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.lg, flexGrow: 1 }}'
    );
  }

  fs.writeFileSync(f, content);
  wrappedCount++;
});

console.log('Done! Wrapped ' + wrappedCount + ' files.');
