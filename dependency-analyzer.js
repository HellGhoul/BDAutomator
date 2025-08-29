const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');

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
        logger.info(`Loaded ${items.length} items`);
      }

      // Load titles
      const titlesPath = path.join(__dirname, 'encyclopedia-data', 'titles.json');
      if (fs.existsSync(titlesPath)) {
        const titles = JSON.parse(fs.readFileSync(titlesPath, 'utf8'));
        titles.forEach(title => {
          this.titleMap.set(title.name, title);
        });
        logger.info(`Loaded ${titles.length} titles`);
      }

      return true;
    } catch (error) {
      logger.exception('Error loading data', error);
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
    logger.info('Starting dependency analysis...');
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

    logger.info(`Processed ${craftableCount} craftable legendary items`);
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
    
    logger.dependencyAnalysis(`Processing recipe: ${recipe.name}`, recipe.name);
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
            logger.dependencyAnalysis(`Processing titled ingredient: titleId=${ingredientResult.titleId}, baseItemId=${ingredientResult.baseItemId}`, 'titled_ingredient');
            
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
              logger.warn(`Title not found in titleMap: ${ingredientResult.titleId}`);
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
      logger.titleParsing(`Parsing titled ingredient: ${ingredientName}`);
      return this.parseTitledIngredient(ingredientName);
    }
    
    // For now, just log unknown ingredients and return null
    logger.warn(`Unknown ingredient: ${ingredientName} - skipping to avoid circular dependency`);
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
    logger.dependencyAnalysis(`Processing base item: ${baseItem.name}`, baseItem.name, { craftable: baseItem.isCraftable });
    
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
        logger.dependencyAnalysis(`Base item ${baseItem.name} is craftable, processing its recipe: ${recipe.name}`, baseItem.name);
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
    logger.titleParsing(`Parsing titled ingredient: ${ingredientName}`);
    
    // Extract title and base item from the ingredient name
    const { titleName, baseItemName } = this.extractTitleAndBase(ingredientName);
    
    if (!titleName || !baseItemName) {
      logger.warn(`Could not extract title and base from: ${ingredientName}`);
      return null;
    }
    
    // Find the title by exact name match
    let title = this.titleMap.get(titleName);
    if (!title) {
      logger.warn(`Title not found: ${titleName}`);
      return null;
    }
    
    // Find the base item by exact name match
    let baseItem = this.itemMap.get(baseItemName);
    if (!baseItem) {
      logger.warn(`Base item not found: ${baseItemName}`);
      return null;
    }
    
    logger.titleParsing(`Successfully parsed: title="${title.name}", base="${baseItem.name}"`);
    
    // Return both IDs as a special object that the recipe can use
    return {
      titleId: title.id,
      baseItemId: baseItem.id,
      type: 'titled_ingredient'
    };
  }

  extractTitleAndBase(titledItemName) {
    logger.titleParsing(`Extracting title and base from: "${titledItemName}"`);
    
    // First, check if the entire string is a base item name
    if (this.itemMap.has(titledItemName)) {
      logger.titleParsing(`Entire string is a base item: "${titledItemName}"`);
      return {
        titleName: null,
        baseItemName: titledItemName
      };
    }
    
    // Instead of using regex patterns, use the actual title data from titles.json
    // This ensures we match exact titles, not partial matches
    for (const [titleId, titleData] of this.titleMap) {
      const titleName = titleData.name;
      const prefix = titleData.prefix || '';
      const suffix = titleData.suffix || '';
      
      // Check if the titled item name starts with the title's prefix and ends with its suffix
      if (prefix && suffix) {
        // Title has both prefix and suffix
        if (titledItemName.startsWith(prefix) && titledItemName.endsWith(suffix)) {
          const baseItemName = titledItemName.substring(prefix.length, titledItemName.length - suffix.length).trim();
          if (this.itemMap.has(baseItemName)) {
            logger.titleParsing(`Found title with prefix+suffix: "${titleName}" for "${titledItemName}"`);
            return {
              titleName: titleName,
              baseItemName: baseItemName
            };
          }
        }
              } else if (prefix) {
        // Title has only prefix (e.g., "Azure dragon's")
        if (titledItemName.startsWith(prefix)) {
          const baseItemName = titledItemName.substring(prefix.length).trim();
          if (this.itemMap.has(baseItemName)) {
            logger.titleParsing(`Found title with prefix: "${titleName}" for "${titledItemName}"`);
            return {
              titleName: titleName,
              baseItemName: baseItemName
            };
          }
        }
      } else if (suffix) {
        // Title has only suffix
        if (titledItemName.endsWith(suffix)) {
          const baseItemName = titledItemName.substring(0, titledItemName.length - suffix.length).trim();
          if (this.itemMap.has(baseItemName)) {
            logger.titleParsing(`Found title with suffix: "${titleName}" for "${titledItemName}"`);
            return {
              titleName: titleName,
              baseItemName: baseItemName
            };
          }
        }
      }
    }
    
    logger.warn(`No exact title match found for: "${titledItemName}"`);
    // If no exact title match, treat the whole name as base item
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
    logger.info(`Saved ${Object.keys(this.flatDependencies).length} dependency records to ${outputPath}`);
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

// Main execution block for testing
if (require.main === module) {
  const analyzer = new DependencyAnalyzer();
  
  try {
    logger.automation('Starting dependency analyzer', 'dependency-analyzer.js');
    
    // Load data
    const dataLoaded = analyzer.loadData();
    if (!dataLoaded) {
      logger.error('Failed to load data');
      process.exit(1);
    }
    
    // Build maps
    analyzer.buildMaps();
    
    // Analyze dependencies
    const dependencies = analyzer.analyzeDependencies();
    
    logger.automation('Dependency analysis completed', 'dependency-analyzer.js', { 
      totalDependencies: Object.keys(dependencies).length 
    });
    
  } catch (error) {
    logger.exception('Dependency analysis failed', error);
    process.exit(1);
  }
}
