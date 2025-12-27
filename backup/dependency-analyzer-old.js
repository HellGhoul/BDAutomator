const fs = require('fs');
const path = require('path');

class DependencyAnalyzer {
  constructor() {
    this.items = [];
    this.titles = [];
    this.itemMap = new Map();
    this.titleMap = new Map();
    this.recipeMap = new Map();
    this.dependencies = {};
    this.flatDependencies = {}; // New flat structure
    this.processedItems = new Set(); // Track processed items to avoid duplicates
  }

  loadData() {
    try {
      const dataDir = './encyclopedia-data';
      const itemsFile = path.join(dataDir, 'items.json');
      const titlesFile = path.join(dataDir, 'titles.json');

      if (!fs.existsSync(itemsFile) || !fs.existsSync(titlesFile)) {
        console.error('Required data files not found');
        return false;
      }

      this.items = JSON.parse(fs.readFileSync(itemsFile, 'utf8'));
      this.titles = JSON.parse(fs.readFileSync(titlesFile, 'utf8'));
      
      this.buildMaps();
      return true;
    } catch (error) {
      console.error('Error loading data:', error);
      return false;
    }
  }

  buildMaps() {
    // Build item map
    this.items.forEach(item => {
      this.itemMap.set(item.name, item);
      if (item.type === 'Recipe') {
        this.recipeMap.set(item.name, item);
      }
    });

    // Build title map
    this.titles.forEach(title => {
      this.titleMap.set(title.name, title);
    });
  }

  analyzeDependencies() {
    console.log('Starting flat dependency analysis...');
    
    // Clear previous data
    this.flatDependencies = {};
    this.processedItems.clear();
    
    // Find all craftable legendary items
    const craftableLegendaryItems = this.items.filter(item => 
      item.isCraftable && item.isLegendary
    );
    
    console.log(`Found ${craftableLegendaryItems.length} craftable legendary items`);
    
    // Process each craftable legendary item
    craftableLegendaryItems.forEach(item => {
      this.processItemDependencies(item);
    });
    
    // Save the flat dependencies
    this.saveFlatDependencies();
    
    return this.flatDependencies;
  }

  processItemDependencies(item) {
    if (this.processedItems.has(item.id)) {
      return; // Already processed
    }
    
    console.log(`Processing item: ${item.name}`);
    this.processedItems.add(item.id);
    
    // Create the main item record
    const itemRecord = {
      id: item.id,
      name: item.name,
      type: item.type,
      isLegendary: item.isLegendary,
      nodeType: 'item',
      children: [], // Will contain IDs of direct dependencies
      totalMaterials: {},
      complexity: 0
    };
    
    // Find the recipe for this item
    const recipeName = `Recipe of ${item.name}`;
    const recipe = this.recipeMap.get(recipeName);
    
    if (recipe) {
      // Add recipe ID to item's children
      itemRecord.children.push(recipe.id);
      
      // Process the recipe
      this.processRecipeDependencies(recipe);
      
      // Calculate total materials and complexity
      this.calculateTotalMaterialsRecursive(itemRecord);
      itemRecord.complexity = this.calculateComplexityRecursive(itemRecord);
    }
    
    // Add to flat dependencies
    this.flatDependencies[item.id] = itemRecord;
  }

  processRecipeDependencies(recipe) {
    if (this.processedItems.has(recipe.id)) {
      return; // Already processed
    }
    
    console.log(`Processing recipe: ${recipe.name}`);
    this.processedItems.add(recipe.id);
    
    // Create the recipe record
    const recipeRecord = {
      id: recipe.id,
      name: recipe.name,
      type: recipe.type,
      isLegendary: recipe.isLegendary,
      nodeType: 'recipe',
      children: [], // Will contain IDs of direct dependencies
      totalMaterials: {},
      complexity: 0
    };
    
    // Process ingredients if available
    if (recipe.ingredients && recipe.ingredients.length > 0) {
      recipe.ingredients.forEach(ingredientName => {
        const ingredientResult = this.processIngredientDependencies(ingredientName);
        if (ingredientResult) {
          if (typeof ingredientResult === 'string') {
            // Direct ID (base item or title)
            recipeRecord.children.push(ingredientResult);
          } else if (ingredientResult.type === 'titled_ingredient') {
            // Titled ingredient - add both title and base item IDs
            recipeRecord.children.push(ingredientResult.titleId);
            recipeRecord.children.push(ingredientResult.baseItemId);
          }
        }
      });
    }
    
    // Calculate total materials and complexity
    this.calculateTotalMaterialsRecursive(recipeRecord);
    recipeRecord.complexity = this.calculateComplexityRecursive(recipeRecord);
    
    // Add to flat dependencies
    this.flatDependencies[recipe.id] = recipeRecord;
  }

  processIngredientDependencies(ingredientName) {
    console.log(`🔍 Processing ingredient: ${ingredientName}`);
    
    // Check if it's a base item (exact match first)
    const baseItem = this.itemMap.get(ingredientName);
    if (baseItem) {
      console.log(`✅ Found base item: ${baseItem.name}`);
      return this.processBaseItemDependencies(baseItem);
    }
    
    // Check if it's a title (exact match first)
    const title = this.titleMap.get(ingredientName);
    if (title) {
      console.log(`✅ Found title: ${title.name}`);
      return this.processTitleDependencies(title);
    }
    
    // Try to parse as "Title's Base Item" pattern
    if (ingredientName.includes("'s ")) {
      console.log(`🔧 Parsing titled ingredient: ${ingredientName}`);
      return this.parseTitledIngredient(ingredientName);
    }
    
    // For now, just log unknown ingredients and return null
    console.log(`❌ Unknown ingredient: ${ingredientName} - skipping to avoid circular dependency`);
    return null;
  }

  processTitledItemDependencies(titledItem) {
    if (this.processedItems.has(titledItem.id)) {
      return titledItem.id; // Already processed, just return ID
    }
    
    console.log(`Processing titled item: ${titledItem.name}`);
    this.processedItems.add(titledItem.id);
    
    // Create the titled item record
    const titledItemRecord = {
      id: titledItem.id,
      name: titledItem.name,
      type: titledItem.type,
      isLegendary: titledItem.isLegendary,
      nodeType: 'titled_item',
      children: [], // Will contain IDs of title and base item
      totalMaterials: {},
      complexity: 0
    };
    
    // Extract title and base item from the name
    const { titleName, baseItemName } = this.extractTitleAndBase(titledItem.name);
    
    if (titleName) {
      const title = this.titleMap.get(titleName);
      if (title) {
        const titleId = this.processTitleDependencies(title);
        if (titleId) {
          titledItemRecord.children.push(titleId);
        }
      }
    }
    
    if (baseItemName) {
      const baseItem = this.itemMap.get(baseItemName);
      if (baseItem) {
        const baseItemId = this.processBaseItemDependencies(baseItem);
        if (baseItemId) {
          titledItemRecord.children.push(baseItemId);
        }
      }
    }
    
    // Calculate total materials and complexity
    this.calculateTotalMaterialsRecursive(titledItemRecord);
    titledItemRecord.complexity = this.calculateComplexityRecursive(titledItemRecord);
    
    // Add to flat dependencies
    this.flatDependencies[titledItem.id] = titledItemRecord;
    
    return titledItem.id;
  }

  processBaseItemDependencies(baseItem) {
    if (this.processedItems.has(baseItem.id)) {
      return baseItem.id; // Already processed, just return ID
    }
    
    console.log(`Processing base item: ${baseItem.name}`);
    this.processedItems.add(baseItem.id);
    
    // Create the base item record
    const baseItemRecord = {
      id: baseItem.id,
      name: baseItem.name,
      type: baseItem.type,
      isLegendary: baseItem.isLegendary,
      nodeType: 'base_item',
      children: [], // No children for base items
      totalMaterials: {},
      complexity: 0
    };
    
    // Base items have no dependencies, so complexity is 0
    baseItemRecord.complexity = 0;
    baseItemRecord.totalMaterials = {
      [baseItem.id]: {
        id: baseItem.id,
        name: baseItem.name,
        type: 'base_item',
        isLegendary: baseItem.isLegendary,
        quantity: 1
      }
    };
    
    // Add to flat dependencies
    this.flatDependencies[baseItem.id] = baseItemRecord;
    
    return baseItem.id;
  }

  processTitleDependencies(title) {
    if (this.processedItems.has(title.id)) {
      return title.id; // Already processed, just return ID
    }
    
    console.log(`Processing title: ${title.name}`);
    this.processedItems.add(title.id);
    
    // Create the title record
    const titleRecord = {
      id: title.id,
      name: title.name,
      type: 'Title',
      isLegendary: false,
      nodeType: 'title',
      children: [], // No children for titles
      totalMaterials: {},
      complexity: 0
    };
    
    // Titles have no dependencies, so complexity is 0
    titleRecord.complexity = 0;
    titleRecord.totalMaterials = {
      [title.id]: {
        id: title.id,
        name: title.name,
        type: 'title',
        isLegendary: false,
        quantity: 1
      }
    };
    
    // Add to flat dependencies
    this.flatDependencies[title.id] = titleRecord;
    
    return title.id;
  }

  extractTitleAndBase(titledItemName) {
    // Handle patterns like "Title's Base Item (III)" or "Title Base Item"
    const patterns = [
      /^(.+?)'s\s+(.+?)(?:\s*\([^)]+\))?$/,  // Title's Base Item (III)
      /^(.+?)\s+(.+?)(?:\s*\([^)]+\))?$/     // Title Base Item (III)
    ];
    
    for (const pattern of patterns) {
      const match = titledItemName.match(pattern);
      if (match) {
        let titleName = match[1].trim();
        let baseItemName = match[2].trim();
        
        // Remove any remaining (III) or similar suffixes
        baseItemName = baseItemName.replace(/\s*\([^)]+\)$/, '');
        
        // Clean up common variations
        if (titleName.endsWith('s') && !titleName.endsWith("'s")) {
          titleName = titleName.slice(0, -1);
        }
        
        return { titleName, baseItemName };
      }
    }
    
    return { titleName: null, baseItemName: titledItemName };
  }

  findTitledItem(itemName) {
    // Find an item that matches the titled item name
    return this.items.find(item => item.name === itemName);
  }

  parseTitledIngredient(ingredientName) {
    console.log(`🔧 Parsing titled ingredient: ${ingredientName}`);
    
    // Extract title and base item from the ingredient name
    const { titleName, baseItemName } = this.extractTitleAndBase(ingredientName);
    
    if (!titleName || !baseItemName) {
      console.log(`❌ Could not extract title and base from: ${ingredientName}`);
      return null;
    }
    
    // Find the title by prefix
    let title = null;
    for (const [titleId, titleData] of this.titleMap) {
      if (titleData.prefix === titleName + "'s") {
        title = titleData;
        break;
      }
    }
    
    if (!title) {
      console.log(`❌ Title not found: ${titleName}'s`);
      return null;
    }
    
    // Find the base item
    const baseItem = this.itemMap.get(baseItemName);
    if (!baseItem) {
      console.log(`❌ Base item not found: ${baseItemName}`);
      return null;
    }
    
    // Return both title and base item IDs
    return {
      titleId: title.id,
      baseItemId: baseItem.id,
      type: 'titled_ingredient'
    };
  }

  calculateTotalMaterialsRecursive(record) {
    const materials = {};
    
    // Add self
    materials[record.id] = {
      id: record.id,
      name: record.name,
      type: record.nodeType,
      isLegendary: record.isLegendary,
      quantity: 1
    };
    
    // Add children materials
    record.children.forEach(childId => {
      const childRecord = this.flatDependencies[childId];
      if (childRecord && childRecord.totalMaterials) {
        Object.values(childRecord.totalMaterials).forEach(material => {
          const key = `${material.type}_${material.name}`;
          if (materials[key]) {
            materials[key].quantity += material.quantity;
          } else {
            materials[key] = { ...material };
          }
        });
      }
    });
    
    record.totalMaterials = materials;
    return materials;
  }

  calculateComplexityRecursive(record) {
    if (record.children.length === 0) {
      return 0;
    }
    
    let complexity = 1; // Base complexity for having children
    
    record.children.forEach(childId => {
      const childRecord = this.flatDependencies[childId];
      if (childRecord) {
        complexity += this.calculateComplexityRecursive(childRecord);
      }
    });
    
    return complexity;
  }

  saveFlatDependencies() {
    try {
      const dataDir = './encyclopedia-data';
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      const output = {
        generated_at: new Date().toISOString(),
        total_records: Object.keys(this.flatDependencies).length,
        dependencies: this.flatDependencies
      };
      
      const outputPath = path.join(dataDir, 'dependencies.json');
      fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
      
      console.log(`✅ Flat dependencies saved to ${outputPath}`);
      console.log(`📊 Total records: ${output.total_records}`);
    } catch (error) {
      console.error('Error saving flat dependencies:', error);
    }
  }

  // Method to get a specific item's dependencies
  getItemDependencies(itemName) {
    const item = this.itemMap.get(itemName);
    if (!item) return null;
    
    return this.flatDependencies[item.id] || null;
  }

  // Method to get all dependencies
  getAllDependencies() {
    return this.flatDependencies;
  }

  // Method to get dependency statistics
  getDependencyStats() {
    const records = Object.values(this.flatDependencies);
    
    if (records.length === 0) {
      return {
        total_records: 0,
        average_complexity: 0,
        highest_complexity: 0,
        lowest_complexity: 0,
        items_by_type: {},
        most_complex_items: []
      };
    }
    
    const complexities = records.map(r => r.complexity).filter(c => c !== undefined);
    const averageComplexity = complexities.reduce((sum, c) => sum + c, 0) / complexities.length;
    
    const itemsByType = {};
    records.forEach(record => {
      const type = record.nodeType;
      itemsByType[type] = (itemsByType[type] || 0) + 1;
    });
    
    const mostComplexItems = records
      .filter(r => r.complexity > 0)
      .sort((a, b) => b.complexity - a.complexity)
      .slice(0, 10)
      .map(r => ({ name: r.name, complexity: r.complexity }));
    
    return {
      total_records: records.length,
      average_complexity: Math.round(averageComplexity * 100) / 100,
      highest_complexity: Math.max(...complexities),
      lowest_complexity: Math.min(...complexities),
      items_by_type: itemsByType,
      most_complex_items: mostComplexItems
    };
  }

  // Method to search dependencies
  searchDependencies(query) {
    const results = [];
    const searchTerm = query.toLowerCase();
    
    Object.values(this.flatDependencies).forEach(record => {
      if (record.name.toLowerCase().includes(searchTerm) ||
          record.type.toLowerCase().includes(searchTerm) ||
          record.nodeType.toLowerCase().includes(searchTerm)) {
        results.push(record);
      }
    });
    
    return results;
  }

  // Method to check if adding an item would create a circular dependency
  wouldCreateCircularDependency(itemId, ingredientName) {
    // Simple check: if the ingredient name contains the item name or vice versa, it might create a loop
    const item = this.itemMap.get(itemId) || this.titleMap.get(itemId);
    if (!item) return false;
    
    const itemName = item.name;
    
    // Check if ingredient contains item name or item contains ingredient
    if (ingredientName.includes(itemName) || itemName.includes(ingredientName)) {
      // This could create a circular dependency
      return true;
    }
    
    return false;
  }

  // Method to get all materials recursively for a given record
  getAllMaterialsRecursive(record) {
    if (!record) return {};
    
    const materials = {};
    
    // Add self
    materials[record.id] = {
      id: record.id,
      name: record.name,
      type: record.nodeType,
      isLegendary: record.isLegendary,
      quantity: 1
    };
    
    // Recursively add children materials
    record.children.forEach(childId => {
      const childRecord = this.flatDependencies[childId];
      if (childRecord) {
        const childMaterials = this.getAllMaterialsRecursive(childRecord);
        Object.values(childMaterials).forEach(material => {
          const key = `${material.type}_${material.name}`;
          if (materials[key]) {
            materials[key].quantity += material.quantity;
          } else {
            materials[key] = { ...material };
          }
        });
      }
    });
    
    return materials;
  }
}

module.exports = DependencyAnalyzer;
