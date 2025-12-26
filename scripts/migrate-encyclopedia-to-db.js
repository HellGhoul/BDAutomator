const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '..', 'AutomatorDatabase.sqlite');
const dataDir = path.join(__dirname, '..', 'encyclopedia-data');

function readJson(fileName, fallback) {
  const filePath = path.join(dataDir, fileName);
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureTables(db) {
  db.serialize(() => {
    db.run(
      `CREATE TABLE IF NOT EXISTS encyclopedia_items (
        id TEXT PRIMARY KEY,
        name TEXT,
        type TEXT,
        isLegendary INTEGER,
        isDrop INTEGER,
        isCraftable INTEGER,
        description TEXT,
        plainAttributes TEXT,
        plainReq TEXT,
        attributes TEXT,
        requirements TEXT,
        ingredients TEXT,
        image_url TEXT,
        source TEXT,
        crawled_at TEXT
      )`
    );
    db.run('CREATE INDEX IF NOT EXISTS idx_encyclopedia_items_name ON encyclopedia_items(name)');
    db.run('CREATE INDEX IF NOT EXISTS idx_encyclopedia_items_type ON encyclopedia_items(type)');

    db.run(
      `CREATE TABLE IF NOT EXISTS encyclopedia_monsters (
        id TEXT PRIMARY KEY,
        name TEXT,
        level INTEGER,
        hp INTEGER,
        attack INTEGER,
        defense INTEGER,
        location TEXT,
        image_url TEXT,
        source TEXT,
        crawled_at TEXT
      )`
    );
    db.run('CREATE INDEX IF NOT EXISTS idx_encyclopedia_monsters_name ON encyclopedia_monsters(name)');

    db.run(
      `CREATE TABLE IF NOT EXISTS encyclopedia_translations (
        id TEXT PRIMARY KEY,
        name TEXT,
        type TEXT,
        originalText TEXT,
        translatedText TEXT,
        url TEXT,
        source TEXT,
        crawled_at TEXT
      )`
    );
    db.run('CREATE INDEX IF NOT EXISTS idx_encyclopedia_translations_name ON encyclopedia_translations(name)');

    db.run(
      `CREATE TABLE IF NOT EXISTS encyclopedia_titles (
        id TEXT PRIMARY KEY,
        name TEXT,
        type TEXT,
        plainAttributes TEXT,
        plainReq TEXT,
        available TEXT,
        slots TEXT,
        attributes TEXT,
        requirements TEXT,
        prefix TEXT,
        suffix TEXT,
        source TEXT,
        crawled_at TEXT
      )`
    );
    db.run('CREATE INDEX IF NOT EXISTS idx_encyclopedia_titles_name ON encyclopedia_titles(name)');

    db.run(
      `CREATE TABLE IF NOT EXISTS encyclopedia_summary (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        crawl_date TEXT,
        total_items INTEGER,
        total_monsters INTEGER,
        total_translations INTEGER,
        total_quests INTEGER,
        files TEXT
      )`
    );

    db.run(
      `CREATE TABLE IF NOT EXISTS encyclopedia_dependencies (
        id TEXT PRIMARY KEY,
        name TEXT,
        type TEXT,
        nodeType TEXT,
        isLegendary INTEGER,
        children TEXT,
        complexity INTEGER
      )`
    );
    db.run('CREATE INDEX IF NOT EXISTS idx_encyclopedia_dependencies_name ON encyclopedia_dependencies(name)');

    db.run(
      `CREATE TABLE IF NOT EXISTS encyclopedia_dependencies_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        generated_at TEXT,
        total_records INTEGER
      )`
    );
  });
}

function migrate() {
  const db = new sqlite3.Database(dbPath);
  ensureTables(db);

  const items = readJson('items.json', []);
  const monsters = readJson('monsters.json', []);
  const translations = readJson('translations.json', []);
  const titles = readJson('titles.json', []);
  const summary = readJson('summary.json', null);
  const dependenciesFile = readJson('dependencies.json', null);

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    db.run('DELETE FROM encyclopedia_items');
    db.run('DELETE FROM encyclopedia_monsters');
    db.run('DELETE FROM encyclopedia_translations');
    db.run('DELETE FROM encyclopedia_titles');
    db.run('DELETE FROM encyclopedia_summary');
    db.run('DELETE FROM encyclopedia_dependencies');
    db.run('DELETE FROM encyclopedia_dependencies_meta');

    const itemStmt = db.prepare(
      `INSERT INTO encyclopedia_items
      (id, name, type, isLegendary, isDrop, isCraftable, description, plainAttributes, plainReq, attributes, requirements, ingredients, image_url, source, crawled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    items.forEach(item => {
      itemStmt.run(
        item.id,
        item.name,
        item.type,
        item.isLegendary ? 1 : 0,
        item.isDrop ? 1 : 0,
        item.isCraftable ? 1 : 0,
        item.description || '',
        JSON.stringify(item.plainAttributes || []),
        JSON.stringify(item.plainReq || []),
        JSON.stringify(item.attributes || {}),
        JSON.stringify(item.requirements || {}),
        JSON.stringify(item.ingredients || []),
        item.image_url || '',
        item.source || '',
        item.crawled_at || ''
      );
    });
    itemStmt.finalize();

    const monsterStmt = db.prepare(
      `INSERT INTO encyclopedia_monsters
      (id, name, level, hp, attack, defense, location, image_url, source, crawled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    monsters.forEach(monster => {
      monsterStmt.run(
        monster.id,
        monster.name,
        monster.level || 0,
        monster.hp || 0,
        monster.attack || 0,
        monster.defense || 0,
        monster.location || '',
        monster.image_url || '',
        monster.source || '',
        monster.crawled_at || ''
      );
    });
    monsterStmt.finalize();

    const translationStmt = db.prepare(
      `INSERT INTO encyclopedia_translations
      (id, name, type, originalText, translatedText, url, source, crawled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    translations.forEach(translation => {
      translationStmt.run(
        translation.id,
        translation.name,
        translation.type,
        translation.originalText || '',
        translation.translatedText || '',
        translation.url || '',
        translation.source || '',
        translation.crawled_at || ''
      );
    });
    translationStmt.finalize();

    const titleStmt = db.prepare(
      `INSERT INTO encyclopedia_titles
      (id, name, type, plainAttributes, plainReq, available, slots, attributes, requirements, prefix, suffix, source, crawled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    titles.forEach(title => {
      titleStmt.run(
        title.id,
        title.name,
        title.type,
        JSON.stringify(title.plainAttributes || []),
        JSON.stringify(title.plainReq || []),
        title.available || '',
        JSON.stringify(title.slots || {}),
        JSON.stringify(title.attributes || {}),
        JSON.stringify(title.requirements || {}),
        title.prefix || '',
        title.suffix || '',
        title.source || '',
        title.crawled_at || ''
      );
    });
    titleStmt.finalize();

    if (summary) {
      db.run(
        `INSERT INTO encyclopedia_summary
        (id, crawl_date, total_items, total_monsters, total_translations, total_quests, files)
        VALUES (1, ?, ?, ?, ?, ?, ?)`,
        [
          summary.crawl_date || null,
          summary.total_items || 0,
          summary.total_monsters || 0,
          summary.total_translations || 0,
          summary.total_quests || 0,
          JSON.stringify(summary.files || [])
        ]
      );
    }

    if (dependenciesFile && dependenciesFile.dependencies) {
      const depStmt = db.prepare(
        `INSERT INTO encyclopedia_dependencies
        (id, name, type, nodeType, isLegendary, children, complexity)
        VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      Object.values(dependenciesFile.dependencies).forEach(dep => {
        depStmt.run(
          dep.id,
          dep.name,
          dep.type,
          dep.nodeType,
          dep.isLegendary ? 1 : 0,
          JSON.stringify(dep.children || []),
          dep.complexity || 0
        );
      });
      depStmt.finalize();

      db.run(
        `INSERT INTO encyclopedia_dependencies_meta
        (id, generated_at, total_records)
        VALUES (1, ?, ?)`,
        [
          dependenciesFile.generated_at || null,
          dependenciesFile.total_records || 0
        ]
      );
    }

    db.run('COMMIT', err => {
      if (err) {
        console.error('Migration failed:', err);
        db.run('ROLLBACK');
      } else {
        console.log('Encyclopedia data migrated to AutomatorDatabase.sqlite');
      }
      db.close();
    });
  });
}

migrate();
