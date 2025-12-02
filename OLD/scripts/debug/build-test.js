// Build test script to verify all imports work
// Run with: node build-test.js

console.log('🔍 Testing all component imports...');

const imports = [
  './src/components/StravaIntegration.js',
  './src/components/StravaCallback.js',
  './src/components/SmartRideAnalysis.js',
  './src/components/ActivityHeatmap.js',
  './src/utils/stravaService.js',
  './src/utils/dateUtils.js'
];

const fs = require('fs');
const path = require('path');

imports.forEach(importPath => {
  const fullPath = path.resolve(importPath);
  if (fs.existsSync(fullPath)) {
    console.log(`✅ ${importPath} - exists`);
    
    // Check for proper export
    const content = fs.readFileSync(fullPath, 'utf-8');
    if (content.includes('export default')) {
      console.log(`  ✅ Has default export`);
    } else {
      console.log(`  ⚠️  No default export found`);
    }
  } else {
    console.log(`❌ ${importPath} - NOT FOUND`);
  }
});

console.log('\n🔍 Checking App.js imports...');
const appContent = fs.readFileSync('./src/App.js', 'utf-8');
const importLines = appContent.split('\n').filter(line => line.includes('import') && line.includes('./'));

importLines.forEach(line => {
  console.log(`📦 ${line.trim()}`);
});

console.log('\n✅ Build test complete');