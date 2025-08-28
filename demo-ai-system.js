const DependencyAnalyzer = require('./dependency-analyzer');
const AIResourceManager = require('./ai-resource-manager');
const fs = require('fs');
const path = require('path');

async function demoAISystem() {
  console.log('🎮 BDAutomator AI Resource Manager Demo\n');
  
  // Initialize systems
  console.log('🚀 Initializing AI systems...');
  const analyzer = new DependencyAnalyzer();
  const aiManager = new AIResourceManager(analyzer);
  
  // Load data
  console.log('📚 Loading game data...');
  analyzer.loadData();
  
  // Load sample inventory
  const inventoryPath = path.join(__dirname, 'encyclopedia-data', 'sample-inventory.json');
  if (fs.existsSync(inventoryPath)) {
    const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
    aiManager.loadInventory(inventory);
  }
  
  // Load farming data
  const farmingPath = path.join(__dirname, 'encyclopedia-data', 'farming-data.json');
  if (fs.existsSync(farmingPath)) {
    const farmingData = JSON.parse(fs.readFileSync(farmingPath, 'utf8'));
    aiManager.loadFarmingData(farmingData);
  }
  
  console.log('✅ Systems ready!\n');
  
  // Demo 1: Basic Resource Prediction
  console.log('🎯 Demo 1: Basic Resource Prediction');
  console.log('='.repeat(50));
  
  aiManager.setTargetItems(['Hell ghoul\'s (III) Celestial Stone']);
  const analysis1 = aiManager.predictNeededResources();
  
  console.log(`Target: Hell ghoul's (III) Celestial Stone`);
  console.log(`Materials needed: ${analysis1.materialRequirements.size}`);
  console.log(`Estimated time: ${analysis1.estimatedTime} minutes`);
  console.log(`Risk level: ${analysis1.riskAssessment}\n`);
  
  // Demo 2: Multiple Target Analysis
  console.log('🎯 Demo 2: Multiple Target Analysis');
  console.log('='.repeat(50));
  
  aiManager.setTargetItems([
    "Hell ghoul's (III) Celestial Stone",
    "Steel Dragon's Platinum Ring (III)",
    "Azure dragon's Nefârtatul's Ring (III)"
  ]);
  
  const analysis2 = aiManager.predictNeededResources();
  
  console.log(`Targets: ${analysis2.targetItems.length} items`);
  console.log(`Total materials: ${analysis2.materialRequirements.size}`);
  console.log(`Total time: ${analysis2.estimatedTime} minutes`);
  console.log(`Risk level: ${analysis2.riskAssessment}\n`);
  
  // Demo 3: Farming Route Optimization
  console.log('🗺️ Demo 3: Farming Route Optimization');
  console.log('='.repeat(50));
  
  analysis2.farmingRecommendations.forEach((rec, index) => {
    console.log(`${index + 1}. ${rec.location}`);
    console.log(`   Materials: ${rec.materials.length} | Time: ${rec.totalTime} min`);
    console.log(`   Priority: ${rec.priority} | Efficiency: ${rec.efficiency.toFixed(2)}`);
    
    console.log('   Route:');
    rec.route.forEach(step => {
      console.log(`     ${step.step}. ${step.material} (${step.monster}) - ${step.estimatedTime} min`);
    });
    console.log('');
  });
  
  // Demo 4: Inventory Optimization
  console.log('🔄 Demo 4: Inventory Optimization');
  console.log('='.repeat(50));
  
  analysis2.inventoryOptimization.forEach((suggestion, index) => {
    console.log(`${index + 1}. ${suggestion.action.toUpperCase()}: ${suggestion.item}`);
    console.log(`   Priority: ${suggestion.priority} | Reason: ${suggestion.reason}`);
    if (suggestion.estimatedTime) {
      console.log(`   Estimated time: ${suggestion.estimatedTime} minutes`);
    }
    console.log('');
  });
  
  // Demo 5: User Preferences
  console.log('⚙️ Demo 5: User Preferences');
  console.log('='.repeat(50));
  
  aiManager.setUserPreferences({
    riskTolerance: 'high',
    timePreference: 'aggressive',
    resourcePriority: 'materials'
  });
  
  console.log('Updated preferences for aggressive farming strategy');
  console.log('Running analysis with new preferences...\n');
  
  const analysis3 = aiManager.predictNeededResources();
  console.log(`New analysis - Risk level: ${analysis3.riskAssessment}`);
  console.log(`Estimated time: ${analysis3.estimatedTime} minutes\n`);
  
  // Demo 6: Save and Load Analysis
  console.log('💾 Demo 6: Save and Load Analysis');
  console.log('='.repeat(50));
  
  const savedPath = aiManager.saveAnalysis(analysis3, 'demo-analysis.json');
  console.log(`Analysis saved to: ${savedPath}`);
  
  const loadedAnalysis = aiManager.loadAnalysis(savedPath);
  if (loadedAnalysis) {
    console.log(`Analysis loaded successfully with ${loadedAnalysis.materialRequirements.size} materials`);
  }
  
  // Demo 7: Get Summary
  console.log('\n📈 Demo 7: AI Summary');
  console.log('='.repeat(50));
  
  const summary = aiManager.getSummary();
  console.log(`Total materials: ${summary.summary.totalMaterials}`);
  console.log(`Total farming time: ${summary.summary.totalFarmingTime} minutes`);
  console.log(`Risk level: ${summary.summary.riskLevel}`);
  
  console.log('\n🏆 Top priorities:');
  summary.summary.topPriorities.forEach((item, index) => {
    console.log(`   ${index + 1}. ${item.name} (Priority: ${item.priority}, Needed: ${item.needed})`);
  });
  
  console.log('\n🎯 Demo complete!');
  console.log('\n💡 Key AI Features Demonstrated:');
  console.log('   ✅ Smart Resource Prediction');
  console.log('   ✅ Optimal Farming Route Generation');
  console.log('   ✅ Inventory Optimization');
  console.log('   ✅ Risk Assessment');
  console.log('   ✅ User Preference Management');
  console.log('   ✅ Analysis Persistence');
  console.log('   ✅ Priority-based Recommendations');
  
  console.log('\n🚀 The AI system is now ready to optimize your farming and crafting!');
}

// Run the demo
demoAISystem().catch(console.error); 