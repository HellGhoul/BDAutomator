// Browser Console Debug Test for Dependency Tree Expansion
// Copy and paste this into your browser console when viewing Blind Vision

console.log('🧪 Browser Debug Test for Dependency Tree Expansion\n');

// Test 1: Check if flatDependencies is loaded
console.log('📊 Test 1: Checking flatDependencies...');
if (window.flatDependencies) {
  console.log('✅ flatDependencies loaded successfully');
  console.log(`  Total records: ${Object.keys(window.flatDependencies).length}`);
  
  // Check Blind Vision specifically
  const blindVisionId = 'item_1756018757208_l3gjamjce';
  const blindVision = window.flatDependencies[blindVisionId];
  if (blindVision) {
    console.log('✅ Blind Vision found in flatDependencies');
    console.log(`  Name: ${blindVision.name}`);
    console.log(`  Type: ${blindVision.nodeType}`);
    console.log(`  Children: ${blindVision.children?.length || 0}`);
  } else {
    console.log('❌ Blind Vision NOT found in flatDependencies');
  }
} else {
  console.log('❌ flatDependencies NOT loaded');
  console.log('  This means the dependencies were not loaded properly');
}

// Test 2: Check if renderDependencyTreeFlat function exists
console.log('\n🔧 Test 2: Checking renderDependencyTreeFlat function...');
if (typeof window.renderDependencyTreeFlat === 'function') {
  console.log('✅ renderDependencyTreeFlat function exists');
} else {
  console.log('❌ renderDependencyTreeFlat function NOT found');
}

// Test 3: Check if toggleNode function exists
console.log('\n🔧 Test 3: Checking toggleNode function...');
if (typeof window.toggleNode === 'function') {
  console.log('✅ toggleNode function exists');
} else {
  console.log('❌ toggleNode function NOT found');
}

// Test 4: Check if getFlatDependencyRecord function exists
console.log('\n🔧 Test 4: Checking getFlatDependencyRecord function...');
if (typeof window.getFlatDependencyRecord === 'function') {
  console.log('✅ getFlatDependencyRecord function exists');
} else {
  console.log('❌ getFlatDependencyRecord function NOT found');
}

// Test 5: Check DOM elements for Blind Vision
console.log('\n🏗️ Test 5: Checking DOM elements...');
const blindVisionElements = document.querySelectorAll('[id*="Blind Vision"]');
console.log(`Found ${blindVisionElements.length} elements containing "Blind Vision"`);
blindVisionElements.forEach((el, index) => {
  console.log(`  ${index + 1}. ${el.tagName} - ID: ${el.id} - Classes: ${el.className}`);
});

// Test 6: Look for children containers
console.log('\n🔍 Test 6: Looking for children containers...');
const childrenContainers = document.querySelectorAll('[id^="children_"]');
console.log(`Found ${childrenContainers.length} children containers`);
childrenContainers.forEach((container, index) => {
  console.log(`  ${index + 1}. ID: ${container.id} - Classes: ${container.className} - Hidden: ${container.classList.contains('hidden')}`);
});

// Test 7: Look for toggle buttons
console.log('\n🔘 Test 7: Looking for toggle buttons...');
const toggleButtons = document.querySelectorAll('[onclick*="toggleNode"]');
console.log(`Found ${toggleButtons.length} toggle buttons`);
toggleButtons.forEach((btn, index) => {
  console.log(`  ${index + 1}. OnClick: ${btn.getAttribute('onclick')} - Classes: ${btn.className}`);
});

// Test 8: Check for hidden CSS class
console.log('\n🎨 Test 8: Checking CSS classes...');
const hiddenElements = document.querySelectorAll('.hidden');
console.log(`Found ${hiddenElements.length} elements with 'hidden' class`);
hiddenElements.forEach((el, index) => {
  console.log(`  ${index + 1}. ${el.tagName} - ID: ${el.id} - Classes: ${el.className}`);
});

// Test 9: Test the toggleNode function manually
console.log('\n🧪 Test 9: Testing toggleNode function manually...');
if (typeof window.toggleNode === 'function') {
  // Find a children container to test with
  const testContainer = document.querySelector('[id^="children_"]');
  if (testContainer) {
    const containerId = testContainer.id.replace('children_', '');
    console.log(`Testing toggleNode with ID: ${containerId}`);
    
    try {
      window.toggleNode(containerId);
      console.log('✅ toggleNode executed without errors');
    } catch (error) {
      console.log('❌ toggleNode failed with error:', error.message);
    }
  } else {
    console.log('⚠️ No children containers found to test with');
  }
}

// Test 10: Check for JavaScript errors
console.log('\n🚨 Test 10: Checking for JavaScript errors...');
console.log('Look at the console above for any red error messages');
console.log('If you see errors, they will prevent the expansion from working');

// Summary and next steps
console.log('\n📋 Debug Summary:');
console.log('1. ✅ Backend logic is working (confirmed by Node.js tests)');
console.log('2. 🔍 The issue is in the browser/UI');
console.log('3. 🎯 Check the results above to identify the problem');

console.log('\n🔧 Common Issues and Solutions:');
console.log('- If flatDependencies is not loaded: Check the dependency loading process');
console.log('- If functions don\'t exist: Check if renderer.js is loaded properly');
console.log('- If DOM elements don\'t exist: Check if the HTML is being generated');
console.log('- If CSS classes aren\'t working: Check if .hidden is defined in CSS');
console.log('- If toggleNode fails: Check for JavaScript errors');

console.log('\n🎯 Next Steps:');
console.log('1. Look at the test results above');
console.log('2. Check for any red error messages in the console');
console.log('3. Use browser dev tools to inspect the DOM');
console.log('4. Look for the specific issue identified above');

console.log('\n💡 Pro Tips:');
console.log('- Use F12 to open dev tools');
console.log('- Check the Elements tab to see the actual HTML');
console.log('- Look for elements with IDs like "children_..."');
console.log('- Check if the "hidden" class is being applied');
console.log('- Test clicking on expandable nodes and watch the console');

console.log('\n🎉 Browser debug test completed!');
console.log('Copy the results and share them to get help fixing the issue.');
