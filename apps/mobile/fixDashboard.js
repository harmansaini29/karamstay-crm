/**
 * fixDashboard.js
 * Surgically rewrites DashboardScreen.tsx so the JSX nesting is correct:
 *   SafeAreaView > ResponsiveContainer > ScrollView > [all content]
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/features/dashboard/DashboardScreen.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// The return statement starts at the `return (` line.
// We'll find everything inside the ScrollView and re-indent it uniformly.
// Strategy: find the opening ScrollView tag and its closing tag,
// and replace ONLY the broken indentation of the direct children.

// Find the line with `        >` that closes the ScrollView opening
// and replace lines between there and `        </ScrollView>` 
// so they're all properly indented with 10 spaces.

// Step 1: After ">` of ScrollView and before `</ScrollView>`, 
// all lines that start with exactly 8 spaces should be 10 spaces.
// Lines that already have more than 8 spaces are fine.

const lines = content.split('\n');
let inScrollViewContent = false;
let scrollViewDepth = 0;

const fixed = lines.map((line) => {
  // Detect the ScrollView `>` closing its opening tag
  if (!inScrollViewContent && line.trimEnd() === '        >') {
    inScrollViewContent = true;
    return line;
  }

  if (inScrollViewContent) {
    // Detect the closing </ScrollView>
    if (line.includes('</ScrollView>')) {
      inScrollViewContent = false;
      return line;
    }

    // Only fix lines that are at exactly 8 spaces (top-level content wrongly placed)
    if (/^        [^ ]/.test(line)) {
      return '  ' + line; // add 2 more spaces → 10 spaces total
    }
  }

  return line;
});

fs.writeFileSync(filePath, fixed.join('\n'), 'utf8');
console.log('DashboardScreen.tsx indentation fixed.');
