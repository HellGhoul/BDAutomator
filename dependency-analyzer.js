const fs = require('fs');
const path = require('path');

class DependencyAnalyzer {
  constructor() {
    this.items = [];
    this.titles = [];
    this.dependencies = {};
    this.itemMap = new Map();
    this.titleMap = new Map();
    this.recipeMap = new Map();
  }

  loadData() {
    try {
      const itemsPath = path.join(__dirname, 'encyclopedia-data', 'items.json');
      const titlesPath = path.join(__dirname, 'encyclopedia-data', 'titles.json');
      
      this.items = JSON.parse(fs.readFileSync(itemsPath, 'utf8'));
      this.titles = JSON.parse(fs.readFileSync(titlesPath, 'utf8'));
      
      // Build maps for quick lookup
      this.buildMaps();
      
      console.log(`Loaded ${this.items.length} items and ${this.titles.length} titles`);
      return true;
    } catch (error) {
      console.error('Error loading data:', error);
      return false;
    }
  }

  buildMaps() {
    // Build item map
    this.items.forEach(item => {
      this.itemMap.set(item.name.toLowerCase(), item);
    });

    // Build title map
    this.titles.forEach(title => {
      this.titleMap.set(title.name.toLowerCase(), title);
    });

    // Build recipe map
    this.items.filter(item => item.type === 'Recipe').forEach(recipe => {
      const targetItemName = recipe.name.replace('Recipe of ', '');
      this.recipeMap.set(targetItemName.toLowerCase(), recipe);
    });
  }

  analyzeDependencies() {
    console.log('Starting dependency analysis...');
    
    const craftableItems = this.items.filter(item => 
      item.isCraftable && item.isLegendary && item.type !== 'Recipe'
    );

    console.log(`Found ${craftableItems.length} craftable legendary items`);

    craftableItems.forEach(item => {
      this.analyzeItemDependencies(item);
    });

    // Save dependency data
    this.saveDependencies();
    
    console.log('Dependency analysis completed!');
    return this.dependencies;
  }

  analyzeItemDependencies(item) {
    const itemName = item.name;
    const recipe = this.recipeMap.get(itemName.toLowerCase());
    
    if (!recipe) {
      console.log(`No recipe found for ${itemName}`);
      return;
    }

    // Create the main item node with only direct children
    const itemNode = {
      id: item.id,
      name: item.name,
      type: item.type,
      isLegendary: item.isLegendary,
      nodeType: 'item',
      children: []
    };

    // Add recipe as direct child
    const recipeNode = {
      id: recipe.id,
      name: recipe.name,
      type: 'Recipe',
      isLegendary: false,
      nodeType: 'recipe',
      children: []
    };

    // Add each ingredient as a direct child of the recipe (no deep nesting)
    recipe.ingredients.forEach(ingredientName => {
      const ingredientNode = this.createSimpleIngredientNode(ingredientName);
      if (ingredientNode) {
        recipeNode.children.push(ingredientNode);
      }
    });

    // Add recipe as child of item
    itemNode.children.push(recipeNode);

    // Calculate accumulated materials
    itemNode.totalMaterials = this.calculateTotalMaterials(itemNode);
    itemNode.complexity = this.calculateComplexity(itemNode);

    this.dependencies[itemName] = itemNode;
  }

  analyzeIngredient(ingredientName) {
    // Check if it's a base item
    const baseItem = this.itemMap.get(ingredientName.toLowerCase());
    if (baseItem) {
      return {
        type: 'base_item',
        name: ingredientName,
        item: baseItem,
        quantity: 1,
        isLegendary: baseItem.isLegendary,
        subDependencies: []
      };
    }

    // Check if it's a titled item (has prefix/suffix)
    const titledItem = this.findTitledItem(ingredientName);
    if (titledItem) {
      return {
        type: 'titled_item',
        name: ingredientName,
        baseItem: titledItem.baseItem,
        title: titledItem.title,
        quantity: 1,
        isLegendary: titledItem.baseItem.isLegendary,
        subDependencies: []
      };
    }

    // If not found, return as unknown
    return {
      type: 'unknown',
      name: ingredientName,
      quantity: 1,
      isLegendary: false,
      subDependencies: []
    };
  }

  createSimpleIngredientNode(ingredientName) {
    // Check if it's a base item
    const baseItem = this.itemMap.get(ingredientName.toLowerCase());
    if (baseItem) {
      return this.createBaseNode(ingredientName, baseItem);
    }

    // Check if it's a titled item (has prefix/suffix)
    const titledItem = this.findTitledItem(ingredientName);
    if (titledItem) {
      return this.createSimpleTitledNode(ingredientName, titledItem);
    }

    // Check if it's a craftable legendary item
    const craftableItem = this.items.find(item => 
      item.name.toLowerCase() === ingredientName.toLowerCase() && 
      item.isCraftable && 
      item.isLegendary && 
      item.type !== 'Recipe'
    );

    if (craftableItem) {
      return this.createSimpleCraftableNode(ingredientName, craftableItem);
    }

    // If not found, return as unknown
    return this.createUnknownNode(ingredientName);
  }

  createBaseNode(ingredientName, baseItem = null) {
    const item = baseItem || this.itemMap.get(ingredientName.toLowerCase());
    
    return {
      id: item?.id || null,
      name: ingredientName,
      type: item?.type || 'Unknown',
      isLegendary: item?.isLegendary || false,
      nodeType: 'base_item',
      children: []
    };
  }

  createSimpleTitledNode(ingredientName, titledItem) {
    // Create the titled item node - NO children, just the item itself
    const titledNode = {
      id: titledItem.baseItem.id,
      name: ingredientName,
      type: titledItem.baseItem.type,
      isLegendary: titledItem.baseItem.isLegendary,
      nodeType: 'titled_item',
      children: []
    };

    return titledNode;
  }

  createSimpleCraftableNode(ingredientName, craftableItem) {
    // Create the craftable item node - NO children, just the item itself
    const craftableNode = {
      id: craftableItem.id,
      name: ingredientName,
      type: craftableItem.type,
      isLegendary: craftableItem.isLegendary,
      nodeType: 'craftable_item',
      children: []
    };

    return craftableNode;
  }

  createUnknownNode(ingredientName) {
    return {
      id: null,
      name: ingredientName,
      type: 'Unknown',
      isLegendary: false,
      nodeType: 'unknown',
      children: []
    };
  }

  findTitledItem(itemName) {
    // Try to match with title patterns
    for (const title of this.titles) {
      // Check prefix + base item
      if (title.prefix) {
        const prefixPattern = `${title.prefix} `;
        if (itemName.startsWith(prefixPattern)) {
          const baseItemName = itemName.substring(prefixPattern.length);
          const baseItem = this.itemMap.get(baseItemName.toLowerCase());
          if (baseItem) {
            return { baseItem, title };
          }
        }
      }

      // Check base item + suffix
      if (title.suffix) {
        const suffixPattern = ` ${title.suffix}`;
        if (itemName.endsWith(suffixPattern)) {
          const baseItemName = itemName.substring(0, itemName.length - suffixPattern.length);
          const baseItem = this.itemMap.get(baseItemName.toLowerCase());
          if (baseItem) {
            return { baseItem, title };
          }
        }
      }
    }

    return null;
  }

  mergeMaterials(target, source) {
    Object.entries(source).forEach(([key, material]) => {
      if (!target[key]) {
        target[key] = { ...material };
      } else {
        target[key].quantity += material.quantity;
      }
    });
  }

  calculateTotalMaterials(node) {
    const materials = {};
    this.traverseNode(node, materials);
    return materials;
  }

  traverseNode(node, materials) {
    // Add current node to materials
    const key = `${node.nodeType}_${node.name}`;
    if (!materials[key]) {
      materials[key] = {
        id: node.id,
        name: node.name,
        type: node.nodeType,
        isLegendary: node.isLegendary,
        quantity: 0
      };
    }
    materials[key].quantity += 1;

    // Recursively traverse children
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => {
        this.traverseNode(child, materials);
      });
    }
  }

  // New method to get all materials recursively from a node
  getAllMaterialsRecursive(node) {
    const materials = {};
    this.traverseNode(node, materials);
    return materials;
  }

  calculateComplexity(node) {
    let complexity = 1; // Base complexity
    
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => {
        if (child.nodeType === 'titled_item') {
          complexity += 2; // Titled items are more complex
        } else if (child.nodeType === 'craftable_item') {
          complexity += 3; // Craftable items are most complex
        } else if (child.nodeType === 'base_item') {
          complexity += 1;
        } else if (child.nodeType === 'title') {
          complexity += 1; // Titles add complexity
        }
        
        if (child.isLegendary) {
          complexity += 1; // Legendary items add complexity
        }
        
        // Recursively calculate complexity for children
        complexity += this.calculateComplexity(child);
      });
    }

    return complexity;
  }



  saveDependencies() {
    const outputPath = path.join(__dirname, 'encyclopedia-data', 'dependencies.json');
    const data = {
      generated_at: new Date().toISOString(),
      total_items: Object.keys(this.dependencies).length,
      dependencies: this.dependencies
    };
    
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log(`Dependencies saved to ${outputPath}`);
  }

  getItemDependencies(itemName) {
    return this.dependencies[itemName] || null;
  }

  getAllDependencies() {
    return this.dependencies;
  }

  getDependencyStats() {
    const stats = {
      total_craftable_items: Object.keys(this.dependencies).length,
      by_complexity: {},
      by_type: {},
      most_complex_items: [],
      average_complexity: 0,
      highest_complexity: 0,
      lowest_complexity: 0
    };

    let totalComplexity = 0;
    const complexityCounts = {};

    Object.values(this.dependencies).forEach(dep => {
      // Count by complexity
      const complexity = dep.complexity || 0;
      complexityCounts[complexity] = (complexityCounts[complexity] || 0) + 1;
      totalComplexity += complexity;

      // Count by item type
      const itemType = dep.type || 'Unknown';
      stats.by_type[itemType] = (stats.by_type[itemType] || 0) + 1;
    });

    stats.by_complexity = complexityCounts;
    stats.average_complexity = stats.total_craftable_items > 0 ? totalComplexity / stats.total_craftable_items : 0;

    // Get most complex items
    stats.most_complex_items = Object.entries(this.dependencies)
      .map(([name, dep]) => ({ name, complexity: dep.complexity || 0 }))
      .sort((a, b) => b.complexity - a.complexity)
      .slice(0, 10);

    // Calculate highest and lowest complexity
    const complexities = Object.values(this.dependencies).map(dep => dep.complexity || 0);
    if (complexities.length > 0) {
      stats.highest_complexity = Math.max(...complexities);
      stats.lowest_complexity = Math.min(...complexities);
    }

    return stats;
  }

  searchDependencies(query) {
    const results = [];
    const searchTerm = query.toLowerCase();

    Object.entries(this.dependencies).forEach(([itemName, dep]) => {
      if (itemName.toLowerCase().includes(searchTerm)) {
        results.push({ itemName, dependency: dep });
        return;
      }

      // Search in children recursively
      this.searchInNode(dep, searchTerm, itemName, results);
    });

    return results;
  }

  searchInNode(node, searchTerm, parentName, results) {
    if (!node.children) return;

    node.children.forEach(child => {
      if (child.name.toLowerCase().includes(searchTerm)) {
        results.push({ 
          itemName: parentName, 
          dependency: this.dependencies[parentName], 
          matchedIngredient: child.name 
        });
      }
      
      // Recursively search in child nodes
      this.searchInNode(child, searchTerm, parentName, results);
    });
  }
}

module.exports = DependencyAnalyzer;
