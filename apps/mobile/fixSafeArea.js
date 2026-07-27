const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

walkDir(path.join(__dirname, 'src'), function(filePath) {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    // Check if the file imports SafeAreaView from 'react-native'
    if (content.includes('SafeAreaView') && content.includes("'react-native'")) {
      // It might be imported as `import { ..., SafeAreaView, ... } from 'react-native';`
      // First, remove SafeAreaView from the react-native import
      const regex = /import\s+{([^}]*)}\s+from\s+['"]react-native['"]\s*;/g;
      content = content.replace(regex, (match, p1) => {
        if (p1.includes('SafeAreaView')) {
          let newImports = p1.split(',').map(s => s.trim()).filter(s => s && s !== 'SafeAreaView');
          if (newImports.length === 0) {
            return '';
          }
          return `import { ${newImports.join(', ')} } from 'react-native';`;
        }
        return match;
      });

      // Now add the import for react-native-safe-area-context
      // Make sure we only add it if SafeAreaView is actually used
      if (content.includes('SafeAreaView') && !content.includes("'react-native-safe-area-context'")) {
        // Add after the last import
        const lastImportIndex = content.lastIndexOf('import ');
        if (lastImportIndex !== -1) {
          const endOfLine = content.indexOf('\n', lastImportIndex);
          content = content.slice(0, endOfLine + 1) + "import { SafeAreaView } from 'react-native-safe-area-context';\n" + content.slice(endOfLine + 1);
        } else {
          content = "import { SafeAreaView } from 'react-native-safe-area-context';\n" + content;
        }
      }

      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Updated ${filePath}`);
    }
  }
});
