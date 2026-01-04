function normalizeKey(value) {
  return (value || '').trim().toLowerCase();
}

function normalizeNodeType(value) {
  return (value || '').trim().toLowerCase();
}

function isRecipeNode(row) {
  const typeKey = normalizeKey(row?.type);
  const nameKey = normalizeKey(row?.name);
  return normalizeNodeType(row?.nodeType) === 'recipe' || typeKey === 'recipe' || nameKey.startsWith('recipe of ');
}

function normalizeTitleKey(value) {
  const raw = (value || '').toLowerCase();
  return raw
    .replace(/\([^)]*\)/g, '')
    .replace(/[`'’"]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseJsonValue(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function buildInventoryCounts(items) {
  const itemCounts = new Map();
  const titleCounts = new Map();

  items.forEach(item => {
    const name = normalizeKey(item.item_name);
    const quantity = Number(item.quantity) || 0;
    if (!name || quantity <= 0) return;
    itemCounts.set(name, (itemCounts.get(name) || 0) + quantity);

    const prefixMatch = name.match(/^(.*?)\s+magic scroll(?:\s*\(.*\))?$/i);
    if (prefixMatch && prefixMatch[1]) {
      const titleName = normalizeTitleKey(prefixMatch[1]);
      if (titleName) {
        titleCounts.set(titleName, (titleCounts.get(titleName) || 0) + quantity);
      }
    }

    const suffixMatch = name.match(/^magic scroll\s+of\s+(.*?)(?:\s*\(.*\))?$/i);
    if (suffixMatch && suffixMatch[1]) {
      const titleName = normalizeTitleKey(`of ${suffixMatch[1]}`);
      if (titleName) {
        titleCounts.set(titleName, (titleCounts.get(titleName) || 0) + quantity);
      }
    }
  });

  return { itemCounts, titleCounts };
}

function collectRequirements(nodeId, nodes, requirements) {
  const node = nodes.get(nodeId);
  if (!node) return;

  const nodeType = node.nodeType || '';
  const children = parseJsonValue(node.children, []);

  if (nodeType === 'recipe' || nodeType === 'base_item' || nodeType === 'title') {
    const key = nodeType === 'title'
      ? normalizeTitleKey(node.name)
      : normalizeKey(node.name);
    if (key) {
      const reqKey = `${nodeType}|${key}`;
      requirements.set(reqKey, {
        key,
        name: node.name,
        type: nodeType,
        quantity: (requirements.get(reqKey)?.quantity || 0) + 1
      });
    }
  } else if (nodeType === 'item' && (!children || children.length === 0)) {
    const key = normalizeKey(node.name);
    if (key) {
      const reqKey = `item|${key}`;
      requirements.set(reqKey, {
        key,
        name: node.name,
        type: 'item',
        quantity: (requirements.get(reqKey)?.quantity || 0) + 1
      });
    }
  }

  children.forEach(childId => collectRequirements(childId, nodes, requirements));
}

function isRequirementSatisfied(req, itemCounts, titleCounts) {
  const have = req.type === 'title'
    ? (titleCounts.get(req.key) || 0)
    : (itemCounts.get(req.key) || 0);
  return have >= req.quantity;
}

function analyzeCrafting(items, depRows) {
  const nodes = new Map();
  depRows.forEach(row => nodes.set(row.id, row));
  const { itemCounts, titleCounts } = buildInventoryCounts(items);

  const craftable = [];

  depRows.forEach(row => {
    if (isRecipeNode(row)) return;
    const nodeType = normalizeNodeType(row.nodeType);
    if (nodeType !== 'item' && nodeType !== 'base_item') return;
    const children = parseJsonValue(row.children, []);
    if (!children || children.length === 0) return;

    const requirements = new Map();
    if (nodeType === 'base_item') {
      (children || []).forEach(childId => collectWishlistRequirements(childId, nodes, requirements));
    } else {
      collectWishlistRequirements(row.id, nodes, requirements);
    }

    const reqList = Array.from(requirements.values());
    if (reqList.length === 0) return;
    const unmet = reqList.filter(req => !isRequirementSatisfied(req, itemCounts, titleCounts));

      if (unmet.length === 0) {
        const craftableCount = computeCraftableCount(reqList, itemCounts, titleCounts);
        craftable.push({
          name: row.name,
          complexity: row.complexity || 0,
          requirements: reqList,
          craftableCount,
          isLegendary: !!row.isLegendary
        });
      }
  });

  return craftable;
}

function findItemNodeByName(depRows, name) {
  const target = normalizeKey(name);
  if (!target) return null;
  const matches = depRows.filter(row =>
    normalizeNodeType(row.nodeType) === 'item' && normalizeKey(row.name) === target
  );
  if (matches.length === 0) return null;
  return matches.find(row => !!row.isLegendary) || matches[0];
}

function findItemNodeByPartialName(depRows, name) {
  const target = normalizeKey(name);
  if (!target) return null;
  const matches = depRows.filter(row =>
    normalizeNodeType(row.nodeType) === 'item' && normalizeKey(row.name).includes(target)
  );
  if (matches.length === 0) return null;
  return matches.find(row => !!row.isLegendary) || matches[0];
}

function findNodeByName(depRows, name) {
  const target = normalizeKey(name);
  if (!target) return null;
  const matches = depRows.filter(row => normalizeKey(row.name) === target);
  if (matches.length === 0) return null;
  return matches.find(row => normalizeNodeType(row.nodeType) === 'item') || matches[0];
}

function findNodeByPartialName(depRows, name) {
  const target = normalizeKey(name);
  if (!target) return null;
  const matches = depRows.filter(row => normalizeKey(row.name).includes(target));
  if (matches.length === 0) return null;
  return matches.find(row => normalizeNodeType(row.nodeType) === 'item') || matches[0];
}

function collectWishlistRequirements(nodeId, nodes, requirements) {
  const node = nodes.get(nodeId);
  if (!node) return;
  const nodeType = normalizeNodeType(node.nodeType);
  const children = parseJsonValue(node.children, []);

  if (nodeType === 'recipe') {
    const key = normalizeKey(node.name);
    if (key) {
      const reqKey = `recipe|${key}`;
      requirements.set(reqKey, {
        key,
        name: node.name,
        type: 'recipe',
        quantity: (requirements.get(reqKey)?.quantity || 0) + 1
      });
    }
    (children || []).forEach(childId => collectWishlistRequirements(childId, nodes, requirements));
    return;
  }

  if (nodeType === 'base_item' || nodeType === 'title') {
    const key = nodeType === 'title'
      ? normalizeTitleKey(node.name)
      : normalizeKey(node.name);
    if (key) {
      const reqKey = `${nodeType}|${key}`;
      requirements.set(reqKey, {
        key,
        name: node.name,
        type: nodeType,
        quantity: (requirements.get(reqKey)?.quantity || 0) + 1
      });
    }
  } else if (nodeType === 'item' && (!children || children.length === 0)) {
    const key = normalizeKey(node.name);
    if (key) {
      const reqKey = `item|${key}`;
      requirements.set(reqKey, {
        key,
        name: node.name,
        type: 'item',
        quantity: (requirements.get(reqKey)?.quantity || 0) + 1
      });
    }
  }

  (children || []).forEach(childId => collectWishlistRequirements(childId, nodes, requirements));
}

function buildRequirementStatus(requirements, itemCounts, titleCounts) {
  return requirements.map(req => {
    const have = req.type === 'title'
      ? (titleCounts.get(req.key) || 0)
      : (itemCounts.get(req.key) || 0);
    return {
      ...req,
      have,
      missing: Math.max(req.quantity - have, 0),
      satisfied: have >= req.quantity
    };
  });
}

function collectRequirementsForTarget(target, nodes) {
  const requirements = new Map();
  const nodeType = normalizeNodeType(target.nodeType);
  if (nodeType === 'item') {
    collectWishlistRequirements(target.id, nodes, requirements);
    return requirements;
  }
  const children = parseJsonValue(target.children, []);
  (children || []).forEach(childId => collectWishlistRequirements(childId, nodes, requirements));
  return requirements;
}

function getRequirementsForItemName(depRows, itemName) {
  let target = findItemNodeByName(depRows, itemName) || findItemNodeByPartialName(depRows, itemName);
  if (!target) {
    target = findNodeByName(depRows, itemName) || findNodeByPartialName(depRows, itemName);
  }
  if (!target) {
    return { item: null, requirements: [] };
  }
  const nodes = new Map();
  depRows.forEach(row => nodes.set(row.id, row));
  const requirements = collectRequirementsForTarget(target, nodes);
  return { item: target, requirements: Array.from(requirements.values()) };
}

function summarizeRequirements(items, requirements) {
  const { itemCounts, titleCounts } = buildInventoryCounts(items);
  const status = buildRequirementStatus(requirements, itemCounts, titleCounts);
  const craftableCount = computeCraftableCount(requirements, itemCounts, titleCounts);
  return { status, craftableCount };
}

function computeCraftableCount(requirements, itemCounts, titleCounts) {
  if (!requirements.length) return 0;
  let maxCraftable = Infinity;

  requirements.forEach(req => {
    const have = req.type === 'title'
      ? (titleCounts.get(req.key) || 0)
      : (itemCounts.get(req.key) || 0);
    const possible = Math.floor(have / req.quantity);
    if (possible < maxCraftable) {
      maxCraftable = possible;
    }
  });

  return Number.isFinite(maxCraftable) ? maxCraftable : 0;
}

function analyzeWishlist(items, depRows, itemName) {
  let target = findItemNodeByName(depRows, itemName) || findItemNodeByPartialName(depRows, itemName);
  if (!target) {
    target = findNodeByName(depRows, itemName) || findNodeByPartialName(depRows, itemName);
  }
  if (!target) {
    return { item: null, requirements: [], status: [] };
  }

  const nodes = new Map();
  depRows.forEach(row => nodes.set(row.id, row));
  const requirements = new Map();
  if (normalizeNodeType(target.nodeType) === 'item') {
    collectWishlistRequirements(target.id, nodes, requirements);
  } else {
    const children = parseJsonValue(target.children, []);
    (children || []).forEach(childId => collectWishlistRequirements(childId, nodes, requirements));
  }

  const reqList = Array.from(requirements.values());
  const { itemCounts, titleCounts } = buildInventoryCounts(items);
  const status = buildRequirementStatus(reqList, itemCounts, titleCounts);
  const craftableCount = computeCraftableCount(reqList, itemCounts, titleCounts);

  return {
    item: target,
    requirements: reqList,
    status,
    craftableCount
  };
}

module.exports = {
  analyzeCrafting,
  analyzeWishlist,
  getRequirementsForItemName,
  summarizeRequirements
};
