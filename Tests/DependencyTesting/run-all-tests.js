#!/usr/bin/env node

// Main test runner for dependency testing
const { execSync } = require('child_process');
const path = require('path');

console.log('🚀 Running All Dependency Tests\n');

const tests = [
  {
    name: 'Dependency Loading Test',
    file: 'test-dependency-loading.js',
    description: 'Tests if dependencies are being loaded correctly'
  },
  {
    name: 'UI Rendering Test',
    file: 'test-ui-rendering.js',
    description: 'Tests if the UI rendering logic is working'
  },
  {
    name: 'Toggle Functionality Test',
    file: 'test-toggle-functionality.js',
    description: 'Tests if the toggle/expand functionality is working'
  }
];

const runTest = (test) => {
  console.log(`\n🧪 Running: ${test.name}`);
  console.log(`📝 Description: ${test.description}`);
  console.log('─'.repeat(60));
  
  try {
    const testPath = path.join(__dirname, test.file);
    const output = execSync(`node "${testPath}"`, { 
      encoding: 'utf8',
      cwd: __dirname
    });
    
    console.log(output);
    console.log(`✅ ${test.name} completed successfully\n`);
    return true;
  } catch (error) {
    console.log(`❌ ${test.name} failed:`);
    console.log(error.message);
    console.log(`\n`);
    return false;
  }
};

// Run all tests
console.log('📋 Test Suite Overview:');
tests.forEach((test, index) => {
  console.log(`  ${index + 1}. ${test.name}`);
  console.log(`     ${test.description}`);
});

let passedTests = 0;
let totalTests = tests.length;

console.log(`\n🎯 Starting test execution (${totalTests} tests total)...\n`);

tests.forEach((test, index) => {
  console.log(`\n📊 Progress: ${index + 1}/${totalTests}`);
  const success = runTest(test);
  if (success) passedTests++;
});

// Final results
console.log('\n' + '='.repeat(60));
console.log('📊 FINAL TEST RESULTS');
console.log('='.repeat(60));
console.log(`✅ Passed: ${passedTests}/${totalTests}`);
console.log(`❌ Failed: ${totalTests - passedTests}/${totalTests}`);
console.log(`📈 Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);

if (passedTests === totalTests) {
  console.log('\n🎉 All tests passed! The dependency system is working correctly.');
} else {
  console.log('\n🔧 Some tests failed. Check the output above for details.');
}

console.log('\n🔍 Next Steps:');
console.log('1. If all tests pass, the issue is likely in the browser/UI');
console.log('2. If tests fail, fix the backend logic first');
console.log('3. Check the browser console for JavaScript errors');
console.log('4. Use browser dev tools to inspect the generated HTML');
console.log('5. Verify that the CSS classes are being applied correctly');

console.log('\n💡 Debugging in Browser:');
console.log('- Open browser dev tools (F12)');
console.log('- Check the Console tab for error messages');
console.log('- Check the Elements tab to see if containers exist');
console.log('- Look for the "hidden" class on children containers');
console.log('- Test clicking on expandable nodes and watch the console');

console.log('\n🎯 Ready for browser testing!');
