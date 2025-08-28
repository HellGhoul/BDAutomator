const fs = require('fs');
const path = require('path');

class AIResourceManager {
  constructor(dependencyAnalyzer) {
    this.analyzer = dependencyAnalyzer;
    this.inventory = new Map(); // Current inventory
    this.targetItems = new Set(); // Items user wants to craft
    this.farmingHistory = []; // Track farming results
    this.dropRates = new Map(); // Monster drop rates
    this.monsterDifficulty = new Map(); // Monster difficulty ratings
    this.userPreferences = {
      riskTolerance: 'medium', // low, medium, high
      timePreference: 'efficient', // efficient, safe, aggressive
      resourcePriority: 'materials' // materials, experience, gold
    };
  }

  // Load current inventory from file or user input
  loadInventory(inventoryData) {
    this.inventory.clear();
    if (Array.isArray(inventoryData)) {
      inventoryData.forEach(item => {
        this.inventory.set(item.name, {
          quantity: item.quantity || 1,
          rarity: item.rarity || 'common',
          type: item.type || 'unknown',
          value: item.value || 0,
          lastUpdated: new Date()
        });
      });
    }
    console.log(`📦 Loaded ${this.inventory.size} inventory items`);
  }

  // Set target items for crafting
  setTargetItems(itemNames) {
    this.targetItems.clear();
    itemNames.forEach(name => this.targetItems.add(name));
    console.log(`🎯 Set ${this.targetItems.size} target items: ${Array.from(this.targetItems).join(', ')}`);
  }

  // Load farming history and drop rates
  loadFarmingData(farmingData) {
    if (farmingData.history) {
      this.farmingHistory = farmingData.history;
    }
    if (farmingData.dropRates) {
      this.dropRates = new Map(Object.entries(farmingData.dropRates));
    }
    if (farmingData.monsterDifficulty) {
      this.monsterDifficulty = new Map(Object.entries(farmingData.monsterDifficulty));
    }
    console.log(`📊 Loaded farming data: ${this.farmingHistory.length} history entries, ${this.dropRates.size} drop rates`);
  }

  // Set user preferences for AI decision making
  setUserPreferences(preferences) {
    this.userPreferences = { ...this.userPreferences, ...preferences };
    console.log('⚙️ Updated user preferences:', this.userPreferences);
  }

  // Main AI Resource Predictor
  predictNeededResources(targetItemName = null) {
    console.log('🧠 AI Resource Predictor analyzing...');
    
    const targets = targetItemName ? [targetItemName] : Array.from(this.targetItems);
    if (targets.length === 0) {
      return { error: 'No target items set for analysis' };
    }

    const analysis = {
      timestamp: new Date(),
      targetItems: targets,
      materialRequirements: new Map(),
      farmingRecommendations: [],
      inventoryOptimization: [],
      estimatedTime: 0,
      riskAssessment: 'low'
    };

    // Analyze each target item
    targets.forEach(targetName => {
      const dependencies = this.analyzer.getItemDependencies(targetName);
      if (dependencies) {
        this.analyzeItemDependencies(dependencies, analysis);
      }
    });

    // Generate farming recommendations
    analysis.farmingRecommendations = this.generateFarmingRecommendations(analysis.materialRequirements);
    
    // Generate inventory optimization suggestions
    analysis.inventoryOptimization = this.generateInventoryOptimization(analysis.materialRequirements);
    
    // Calculate estimates
    analysis.estimatedTime = this.estimateTotalFarmingTime(analysis.farmingRecommendations);
    analysis.riskAssessment = this.assessOverallRisk(analysis.farmingRecommendations);

    console.log(`✅ AI analysis complete: ${analysis.materialRequirements.size} materials needed`);
    return analysis;
  }

  // Analyze dependencies for a specific item
  analyzeItemDependencies(dependencies, analysis) {
    const processNode = (node, depth = 0) => {
      if (!node || depth > 10) return; // Prevent infinite recursion
      
      const nodeName = node.name;
      const currentQuantity = this.inventory.get(nodeName)?.quantity || 0;
      const requiredQuantity = this.calculateRequiredQuantity(node, depth);
      
      if (requiredQuantity > currentQuantity) {
        const needed = requiredQuantity - currentQuantity;
        analysis.materialRequirements.set(nodeName, {
          name: nodeName,
          required: requiredQuantity,
          current: currentQuantity,
          needed: needed,
          type: node.nodeType || 'unknown',
          rarity: this.getRarity(node),
          priority: this.calculatePriority(node, depth, needed),
          source: this.findBestSource(nodeName),
          estimatedFarmingTime: this.estimateFarmingTime(nodeName, needed)
        });
      }

      // Process children recursively
      if (node.children && node.children.length > 0) {
        node.children.forEach(childId => {
          const childNode = this.analyzer.flatDependencies[childId];
          if (childNode) {
            processNode(childNode, depth + 1);
          }
        });
      }
    };

    processNode(dependencies);
  }

  // Calculate required quantity based on crafting requirements
  calculateRequiredQuantity(node, depth) {
    // Base quantity is 1, but can be modified based on crafting requirements
    let baseQuantity = 1;
    
    // If it's a recipe, check if it produces multiple items
    if (node.nodeType === 'recipe') {
      // Some recipes might produce multiple items
      baseQuantity = 1; // Default, could be enhanced with recipe data
    }
    
    // Higher depth items might need more quantity due to crafting failures
    const depthMultiplier = Math.max(1, depth * 0.1);
    
    return Math.ceil(baseQuantity * depthMultiplier);
  }

  // Calculate priority for materials
  calculatePriority(node, depth, needed) {
    let priority = 1;
    
    // Higher priority for rare materials
    if (this.getRarity(node) === 'legendary') priority += 5;
    else if (this.getRarity(node) === 'epic') priority += 3;
    else if (this.getRarity(node) === 'rare') priority += 2;
    
    // Higher priority for items needed in larger quantities
    if (needed > 5) priority += 2;
    else if (needed > 1) priority += 1;
    
    // Higher priority for deeper dependency items
    priority += depth;
    
    return priority;
  }

  // Get rarity of an item
  getRarity(node) {
    if (node.isLegendary) return 'legendary';
    // Could be enhanced with more detailed rarity detection
    return 'common';
  }

  // Find best source for an item
  findBestSource(itemName) {
    // Check if we have drop rate data
    if (this.dropRates.has(itemName)) {
      const dropData = this.dropRates.get(itemName);
      return dropData.monsters.sort((a, b) => b.dropRate - a.dropRate)[0];
    }
    
    // Default source based on item type
    if (itemName.includes('Ring')) return { monster: 'Ring monsters', location: 'Ring areas' };
    if (itemName.includes('Shield')) return { monster: 'Shield monsters', location: 'Shield areas' };
    
    return { monster: 'General monsters', location: 'General areas' };
  }

  // Estimate farming time for an item
  estimateFarmingTime(itemName, needed) {
    const baseTime = 5; // 5 minutes per item as base
    const rarity = this.getRarity({ name: itemName });
    
    let timeMultiplier = 1;
    if (rarity === 'legendary') timeMultiplier = 3;
    else if (rarity === 'epic') timeMultiplier = 2;
    else if (rarity === 'rare') timeMultiplier = 1.5;
    
    return Math.ceil(baseTime * timeMultiplier * needed);
  }

  // Generate optimal farming recommendations
  generateFarmingRecommendations(materialRequirements) {
    const recommendations = [];
    
    // Convert to array and sort by priority
    const materials = Array.from(materialRequirements.values())
      .sort((a, b) => b.priority - a.priority);
    
    // Group by source location for efficiency
    const locationGroups = new Map();
    
    materials.forEach(material => {
      const source = material.source;
      const locationKey = source.location || 'unknown';
      
      if (!locationGroups.has(locationKey)) {
        locationGroups.set(locationKey, []);
      }
      locationGroups.get(locationKey).push(material);
    });
    
    // Generate recommendations for each location
    locationGroups.forEach((materials, location) => {
      const totalTime = materials.reduce((sum, m) => sum + m.estimatedFarmingTime, 0);
      const totalPriority = materials.reduce((sum, m) => sum + m.priority, 0);
      
      recommendations.push({
        location: location,
        materials: materials,
        totalTime: totalTime,
        priority: totalPriority,
        efficiency: totalPriority / totalTime,
        route: this.generateFarmingRoute(materials, location),
        estimatedRewards: this.estimateLocationRewards(materials, location)
      });
    });
    
    // Sort by efficiency and priority
    recommendations.sort((a, b) => {
      if (Math.abs(a.efficiency - b.efficiency) < 0.1) {
        return b.priority - a.priority;
      }
      return b.efficiency - a.efficiency;
    });
    
    return recommendations;
  }

  // Generate specific farming route for materials
  generateFarmingRoute(materials, location) {
    const route = [];
    
    // Sort materials by estimated farming time (shorter first)
    const sortedMaterials = materials.sort((a, b) => a.estimatedFarmingTime - b.estimatedFarmingTime);
    
    sortedMaterials.forEach((material, index) => {
      route.push({
        step: index + 1,
        material: material.name,
        monster: material.source.monster,
        estimatedTime: material.estimatedFarmingTime,
        priority: material.priority,
        notes: this.generateFarmingNotes(material)
      });
    });
    
    return route;
  }

  // Generate farming notes and tips
  generateFarmingNotes(material) {
    const notes = [];
    
    if (material.rarity === 'legendary') {
      notes.push('High priority - legendary material');
    }
    
    if (material.needed > 5) {
      notes.push(`Large quantity needed (${material.needed})`);
    }
    
    if (material.estimatedFarmingTime > 30) {
      notes.push('Long farming time - consider breaks');
    }
    
    return notes;
  }

  // Estimate rewards for a location
  estimateLocationRewards(materials, location) {
    const totalValue = materials.reduce((sum, m) => sum + (m.value || 0), 0);
    const totalRarity = materials.reduce((sum, m) => {
      const rarityValue = { common: 1, rare: 3, epic: 5, legendary: 10 };
      return sum + (rarityValue[m.rarity] || 1);
    }, 0);
    
    return {
      estimatedValue: totalValue,
      rarityScore: totalRarity,
      materialCount: materials.length,
      efficiency: totalRarity / materials.length
    };
  }

  // Generate inventory optimization suggestions
  generateInventoryOptimization(materialRequirements) {
    const suggestions = [];
    
    // Check for excess inventory items
    this.inventory.forEach((itemData, itemName) => {
      const needed = materialRequirements.get(itemName);
      
      if (!needed && itemData.quantity > 1) {
        // Item not needed for current targets
        suggestions.push({
          action: 'consider_selling',
          item: itemName,
          quantity: itemData.quantity,
          reason: 'Not needed for current crafting goals',
          estimatedValue: itemData.value * itemData.quantity,
          priority: 'low'
        });
      } else if (needed && itemData.quantity > needed.required * 1.5) {
        // Excess quantity
        suggestions.push({
          action: 'reduce_quantity',
          item: itemName,
          current: itemData.quantity,
          recommended: Math.ceil(needed.required * 1.2), // Keep 20% buffer
          excess: itemData.quantity - Math.ceil(needed.required * 1.2),
          reason: 'Excess quantity beyond needs',
          priority: 'medium'
        });
      }
    });
    
    // Check for missing critical materials
    materialRequirements.forEach((material, itemName) => {
      if (material.priority >= 8) { // High priority items
        suggestions.push({
          action: 'prioritize_farming',
          item: itemName,
          needed: material.needed,
          priority: material.priority,
          reason: 'High priority material for crafting',
          estimatedTime: material.estimatedFarmingTime,
          priority: 'high'
        });
      }
    });
    
    // Sort by priority
    suggestions.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
    
    return suggestions;
  }

  // Estimate total farming time
  estimateTotalFarmingTime(recommendations) {
    return recommendations.reduce((total, rec) => total + rec.totalTime, 0);
  }

  // Assess overall risk of farming plan
  assessOverallRisk(recommendations) {
    let riskScore = 0;
    
    recommendations.forEach(rec => {
      // Higher risk for longer farming sessions
      if (rec.totalTime > 120) riskScore += 2;
      else if (rec.totalTime > 60) riskScore += 1;
      
      // Higher risk for high-priority materials
      if (rec.priority > 20) riskScore += 2;
      else if (rec.priority > 10) riskScore += 1;
    });
    
    if (riskScore >= 6) return 'high';
    if (riskScore >= 3) return 'medium';
    return 'low';
  }

  // Get summary of AI recommendations
  getSummary() {
    const analysis = this.predictNeededResources();
    
    return {
      summary: {
        totalMaterials: analysis.materialRequirements.size,
        totalFarmingTime: analysis.estimatedTime,
        riskLevel: analysis.riskAssessment,
        topPriorities: Array.from(analysis.materialRequirements.values())
          .sort((a, b) => b.priority - a.priority)
          .slice(0, 5)
          .map(m => ({ name: m.name, priority: m.priority, needed: m.needed }))
      },
      recommendations: analysis.farmingRecommendations.slice(0, 3), // Top 3 locations
      optimization: analysis.inventoryOptimization.slice(0, 5), // Top 5 suggestions
      fullAnalysis: analysis
    };
  }

  // Save AI analysis to file
  saveAnalysis(analysis, filename = null) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const defaultFilename = `ai-analysis-${timestamp}.json`;
    const filepath = path.join(__dirname, 'encyclopedia-data', filename || defaultFilename);
    
    try {
      fs.writeFileSync(filepath, JSON.stringify(analysis, null, 2));
      console.log(`💾 AI analysis saved to: ${filepath}`);
      return filepath;
    } catch (error) {
      console.error('❌ Failed to save AI analysis:', error);
      return null;
    }
  }

  // Load AI analysis from file
  loadAnalysis(filepath) {
    try {
      const data = fs.readFileSync(filepath, 'utf8');
      const analysis = JSON.parse(data);
      console.log(`📂 AI analysis loaded from: ${filepath}`);
      return analysis;
    } catch (error) {
      console.error('❌ Failed to load AI analysis:', error);
      return null;
    }
  }
}

module.exports = AIResourceManager; 