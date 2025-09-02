# Dependency Testing Suite

This folder contains comprehensive tests for the dependency system functionality.

## 🧪 Test Files

### 1. `test-dependency-loading.js`
- **Purpose**: Tests if dependencies are being loaded correctly from JSON files
- **What it tests**: File loading, data parsing, dependency record lookup
- **Key checks**: Blind Vision and The Iron Maiden dependency structures

### 2. `test-ui-rendering.js`
- **Purpose**: Tests the UI rendering logic for dependency trees
- **What it tests**: Node rendering, children container creation, expandable logic
- **Key checks**: Recipe vs base item handling, children rendering

### 3. `test-toggle-functionality.js`
- **Purpose**: Tests the toggle/expand functionality
- **What it tests**: CSS class manipulation, DOM element creation, toggle logic
- **Key checks**: Hidden class toggling, element ID generation

### 4. `run-all-tests.js`
- **Purpose**: Main test runner that executes all tests in sequence
- **What it does**: Runs all tests and provides a summary report
- **Output**: Pass/fail results and debugging guidance

## 🚀 How to Run

### Run All Tests
```bash
cd Tests/DependencyTesting
node run-all-tests.js
```

### Run Individual Tests
```bash
cd Tests/DependencyTesting

# Test dependency loading
node test-dependency-loading.js

# Test UI rendering
node test-ui-rendering.js

# Test toggle functionality
node test-toggle-functionality.js
```

## 📊 What the Tests Check

### Dependency Loading Test
- ✅ All JSON files exist and are readable
- ✅ Blind Vision record found with correct structure
- ✅ The Iron Maiden record found with correct structure
- ✅ Dependency analyzer can be instantiated
- ✅ `processItemDependencies` method exists and works

### UI Rendering Test
- ✅ `renderDependencyTreeFlat` logic works correctly
- ✅ Recipes get special handling
- ✅ Base items with children are expandable
- ✅ Children containers are created properly
- ✅ Complete dependency chains are processed

### Toggle Functionality Test
- ✅ `toggleNode` function logic works
- ✅ CSS classes are manipulated correctly
- ✅ DOM elements are created with proper IDs
- ✅ Multiple toggle cycles work
- ✅ Real node ID formats are valid

## 🔍 Debugging the UI

If all tests pass but the UI still doesn't work:

### 1. Check Browser Console
- Open dev tools (F12)
- Look for JavaScript errors
- Check for the debug logs we added

### 2. Inspect DOM Elements
- Look for `children_*` containers
- Check if they have the `hidden` class
- Verify that toggle buttons exist

### 3. Test Click Events
- Click on expandable nodes
- Watch the console for toggle logs
- Check if CSS classes change

### 4. Common Issues
- **Missing CSS**: The `.hidden` class might not be defined
- **DOM not ready**: Elements might not exist when toggle is called
- **Event binding**: Click events might not be properly bound
- **CSS conflicts**: Other styles might override the hidden class

## 🎯 Expected Behavior

After running the tests and fixing any issues:

1. **Blind Vision** should show 📁 and be clickable
2. **Clicking Blind Vision** should expand to show Recipe of Blind Vision
3. **Recipe of Blind Vision** should show its 4 ingredients
4. **The Iron Maiden** should show 📁 and be clickable
5. **Clicking The Iron Maiden** should expand to show its recipe

## 🆘 Getting Help

If tests fail or you need assistance:

1. **Check the test output** for specific error messages
2. **Look at the console logs** for debugging information
3. **Verify file paths** and data structure
4. **Check for syntax errors** in the main code files

The test suite will help identify exactly where the problem is occurring! 🎉
