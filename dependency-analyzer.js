const fs = require('fs');
const path = require('path');

class DependencyAnalyzer {
  constructor() {
    this.itemMap = new Map();
    this.recipeMap = new Map();
    this.titleMap = new Map();
    this.flatDependencies = {};
    this.processedItems = new Set();
  }

  loadData() {
    try {
      // Load items
      const itemsPath = path.join(__dirname, 'encyclopedia-data', 'items.json');
      if (fs.existsSync(itemsPath)) {
        const items = JSON.parse(fs.readFileSync(itemsPath, 'utf8'));
        items.forEach(item => {
          this.itemMap.set(item.name, item);
          if (item.type === 'Recipe') {
            this.recipeMap.set(item.name, item);
          }
        });
        console.log(`Loaded ${items.length} items`);
      }

      // Load titles
      const titlesPath = path.join(__dirname, 'encyclopedia-data', 'titles.json');
      if (fs.existsSync(titlesPath)) {
        const titles = JSON.parse(fs.readFileSync(titlesPath, 'utf8'));
        titles.forEach(title => {
          this.titleMap.set(title.name, title);
        });
        console.log(`Loaded ${titles.length} titles`);
      }

      return true;
    } catch (error) {
      console.error('Error loading data:', error);
      return false;
    }
  }

  buildMaps() {
    // Build recipe map for easier lookup
    this.itemMap.forEach((item, name) => {
      if (item.type === 'Recipe') {
        this.recipeMap.set(name, item);
      }
    });
  }

  analyzeDependencies() {
    console.log('Starting dependency analysis...');
    this.flatDependencies = {};
    this.processedItems.clear();

    // Process all craftable legendary items
    let craftableCount = 0;
    this.itemMap.forEach((item, name) => {
      if (item.isCraftable && item.isLegendary) {
        this.processItemDependencies(item);
        craftableCount++;
      }
    });

    console.log(`Processed ${craftableCount} craftable legendary items`);
    this.saveFlatDependencies();
    return this.flatDependencies;
  }

  processItemDependencies(item) {
    if (this.processedItems.has(item.id)) {
      return item.id;
    }
    
    this.processedItems.add(item.id);
    
    const itemRecord = {
      id: item.id,
      name: item.name,
      type: item.type,
      isLegendary: item.isLegendary,
      nodeType: 'item',
      children: [],
      complexity: 0
    };
    
    // If it's a craftable legendary item, find its recipe
    if (item.isCraftable && item.isLegendary) {
      const recipe = this.findRecipeForItem(item.name);
      if (recipe) {
        const recipeId = this.processRecipeDependencies(recipe);
        if (recipeId) {
          itemRecord.children.push(recipeId);
        }
      }
    }
    
    itemRecord.complexity = this.calculateComplexityRecursive(itemRecord);
    
    this.flatDependencies[item.id] = itemRecord;
    return item.id;
  }

  processRecipeDependencies(recipe) {
    if (this.processedItems.has(recipe.id)) {
      return recipe.id;
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
      children: [],
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
            // Titled ingredient - we need to process both title and base item dependencies
            // to ensure they are created in flatDependencies before adding their IDs
            console.log(`🔧 Processing titled ingredient: titleId=${ingredientResult.titleId}, baseItemId=${ingredientResult.baseItemId}`);
            
            // The parseTitledIngredient function returns IDs, but we need to find the actual objects
            // We need to search through the maps to find the objects with these IDs
            let title = null;
            let baseItem = null;
            
            // Find title by ID
            for (const [name, titleData] of this.titleMap) {
              if (titleData.id === ingredientResult.titleId) {
                title = titleData;
                break;
              }
            }
            
            // Find base item by ID
            for (const [name, itemData] of this.itemMap) {
              if (itemData.id === ingredientResult.baseItemId) {
                baseItem = itemData;
                break;
              }
            }
            
            if (title) {
              // Process title dependencies to ensure it's created in flatDependencies
              const processedTitleId = this.processTitleDependencies(title);
              if (processedTitleId) {
                recipeRecord.children.push(processedTitleId);
              }
            } else {
              console.log(`⚠️ Title not found in titleMap: ${ingredientResult.titleId}`);
              recipeRecord.children.push(ingredientResult.titleId);
            }
            
            if (baseItem) {
              // Process base item dependencies to ensure it's created in flatDependencies
              const processedBaseItemId = this.processBaseItemDependencies(baseItem);
              if (processedBaseItemId) {
                recipeRecord.children.push(processedBaseItemId);
              }
            } else {
              console.log(`⚠️ Base item not found in itemMap: ${ingredientResult.baseItemId}`);
              recipeRecord.children.push(ingredientResult.baseItemId);
            }
          }
        }
      });
    }
    
    recipeRecord.complexity = this.calculateComplexityRecursive(recipeRecord);
    
    // Add to flat dependencies
    this.flatDependencies[recipe.id] = recipeRecord;
    return recipe.id;
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
      return titledItem.id;
    }
    
    this.processedItems.add(titledItem.id);
    
    const titledItemRecord = {
      id: titledItem.id,
      name: titledItem.name,
      type: titledItem.type,
      isLegendary: titledItem.isLegendary,
      nodeType: 'titled_item',
      children: [],
      complexity: 0
    };
    
    // Process title and base item dependencies
    if (titledItem.title) {
      const titleId = this.processTitleDependencies(titledItem.title);
      if (titleId) {
        titledItemRecord.children.push(titleId);
      }
    }
    
    if (titledItem.baseItem) {
      const baseItemId = this.processBaseItemDependencies(titledItem.baseItem);
      if (baseItemId) {
        titledItemRecord.children.push(baseItemId);
      }
    }
    
    titledItemRecord.complexity = this.calculateComplexityRecursive(titledItemRecord);
    
    this.flatDependencies[titledItem.id] = titledItemRecord;
    return titledItem.id;
  }

  processBaseItemDependencies(baseItem) {
    // For base items, we want to allow unlimited recursion to show all layers
    // So we don't check if it's already processed
    console.log(`🔍 Processing base item: ${baseItem.name} (craftable: ${baseItem.isCraftable})`);
    
    const baseItemRecord = {
      id: baseItem.id,
      name: baseItem.name,
      type: baseItem.type,
      isLegendary: baseItem.isLegendary,
      nodeType: 'base_item',
      children: [],
      complexity: 0
    };
    
    // If the base item is craftable, process its dependencies
    if (baseItem.isCraftable) {
      const recipe = this.findRecipeForItem(baseItem.name);
      if (recipe) {
        console.log(`🔍 Base item ${baseItem.name} is craftable, processing its recipe: ${recipe.name}`);
        const recipeId = this.processRecipeDependencies(recipe);
        if (recipeId) {
          baseItemRecord.children.push(recipeId);
        }
      }
    }
    
    baseItemRecord.complexity = this.calculateComplexityRecursive(baseItemRecord);
    
    this.flatDependencies[baseItem.id] = baseItemRecord;
    return baseItem.id;
  }

  processTitleDependencies(title) {
    if (this.processedItems.has(title.id)) {
      return title.id;
    }
    
    this.processedItems.add(title.id);
    
    const titleRecord = {
      id: title.id,
      name: title.name,
      type: title.type,
      isLegendary: title.isLegendary,
      nodeType: 'title',
      children: [],
      complexity: 0
    };
    
    titleRecord.complexity = this.calculateComplexityRecursive(titleRecord);
    
    this.flatDependencies[title.id] = titleRecord;
    return title.id;
  }

  findRecipeForItem(itemName) {
    const recipeName = `Recipe of ${itemName}`;
    return this.recipeMap.get(recipeName);
  }

  parseTitledIngredient(ingredientName) {
    console.log(`🔧 Parsing titled ingredient: ${ingredientName}`);
    
    // Extract title and base item from the ingredient name
    const { titleName, baseItemName } = this.extractTitleAndBase(ingredientName);
    
    if (!titleName || !baseItemName) {
      console.log(`❌ Could not extract title and base from: ${ingredientName}`);
      return null;
    }
    
    // Find the title by prefix (more flexible matching)
    let title = this.titleMap.get(titleName);
    if (!title) {
      // Try to find by prefix that contains the title name
      for (const [name, titleData] of this.titleMap) {
        if (titleData.prefix && titleData.prefix.toLowerCase().includes(titleName.toLowerCase())) {
          title = titleData;
          console.log(`✅ Found title by prefix: "${titleData.prefix}" for "${titleName}"`);
          break;
        }
      }
    }
    
    if (!title) {
      console.log(`❌ Title not found: ${titleName}`);
      return null;
    }
    
    // Find the base item - try exact match first, then try without suffixes
    let baseItem = this.itemMap.get(baseItemName);
    if (!baseItem) {
      // Try to find by removing common suffixes like (III), (II), etc.
      const baseItemWithoutSuffix = baseItemName.replace(/\s*\([^)]+\)$/, '');
      if (baseItemWithoutSuffix !== baseItemName) {
        baseItem = this.itemMap.get(baseItemWithoutSuffix);
        if (baseItem) {
          console.log(`✅ Found base item without suffix: "${baseItemWithoutSuffix}" for "${baseItemName}"`);
        }
      }
      
      // If still not found, try to find items that contain the base name
      if (!baseItem) {
        for (const [name, itemData] of this.itemMap) {
          if (name.toLowerCase().includes(baseItemName.toLowerCase()) || 
              baseItemName.toLowerCase().includes(name.toLowerCase())) {
            baseItem = itemData;
            console.log(`✅ Found base item by partial match: "${name}" for "${baseItemName}"`);
            break;
          }
        }
      }
    }
    
    if (!baseItem) {
      console.log(`❌ Base item not found: ${baseItemName}`);
      return null;
    }
    
    console.log(`✅ Successfully parsed: title="${title.name}", base="${baseItem.name}"`);
    
    // Return both IDs as a special object that the recipe can use
    return {
      titleId: title.id,
      baseItemId: baseItem.id,
      type: 'titled_ingredient'
    };
  }

  extractTitleAndBase(titledItemName) {
    console.log(`🔍 Extracting title and base from: "${titledItemName}"`);
    
    // First, check if the entire string is a base item name
    if (this.itemMap.has(titledItemName)) {
      console.log(`✅ Entire string is a base item: "${titledItemName}"`);
      return {
        titleName: null,
        baseItemName: titledItemName
      };
    }
    
    // Handle patterns like "Title's Base Item (III)" or "Title Base Item"
    // IMPORTANT: More specific patterns must come FIRST to avoid false matches
    const titlePatterns = [
      /^(.+?)'s (.+?)(?:\s*\([^)]+\))?$/,  // e.g., "Azure dragon's God Forged Boots (III)" - CHECK FIRST
      /^(.+?) (.+?)(?:\s*\([^)]+\))?$/     // e.g., "Minotaur king Great axe (II)" - CHECK SECOND
    ];
    
    for (const pattern of titlePatterns) {
      const match = titledItemName.match(pattern);
      if (match) {
        let titleName = match[1].trim();
        let baseItemName = match[2].trim();
        
        // Validate that the extracted base item name is actually a valid item
        // This prevents incorrect splitting like "Keh's might" being split into "Keh" and "might"
        if (this.itemMap.has(baseItemName)) {
          console.log(`✅ Extracted: title="${titleName}", base="${baseItemName}"`);
          return {
            titleName: titleName,
            baseItemName: baseItemName
          };
        } else {
          console.log(`⚠️ Extracted base item "${baseItemName}" is not a valid item, trying next pattern`);
          continue;
        }
      }
    }
    
    console.log(`❌ No valid pattern matched for: "${titledItemName}"`);
    // If no pattern matches, treat the whole name as base item
    return {
      titleName: null,
      baseItemName: titledItemName
    };
  }

  calculateComplexityRecursive(record) {
    if (!record || !record.children || record.children.length === 0) {
      return 1;
    }
    
    let maxChildComplexity = 0;
    record.children.forEach(childId => {
      const childRecord = this.flatDependencies[childId];
      if (childRecord) {
        const childComplexity = this.calculateComplexityRecursive(childRecord);
        maxChildComplexity = Math.max(maxChildComplexity, childComplexity);
      }
    });
    
    return maxChildComplexity + 1;
  }

  saveFlatDependencies() {
    const outputPath = path.join(__dirname, 'encyclopedia-data', 'dependencies.json');
    const data = {
      generated_at: new Date().toISOString(),
      total_records: Object.keys(this.flatDependencies).length,
      dependencies: this.flatDependencies
    };
    
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log(`Saved ${Object.keys(this.flatDependencies).length} dependency records to ${outputPath}`);
  }

  getItemDependencies(itemName) {
    return this.flatDependencies[itemName];
  }

  getAllDependencies() {
    return this.flatDependencies;
  }

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
