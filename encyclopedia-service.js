const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

class EncyclopediaService {
  constructor() {
    this.dbPath = path.join(__dirname, 'encyclopedia.db');
    this.initDatabase();
  }

  initDatabase() {
    this.db = new sqlite3.Database(this.dbPath);
    
    // Create tables for different game data types
    this.db.serialize(() => {
      // Items table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS items (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          rarity TEXT,
          level INTEGER,
          stats TEXT,
          description TEXT,
          image_url TEXT,
          source TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Monsters table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS monsters (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          level INTEGER,
          hp INTEGER,
          attack INTEGER,
          defense INTEGER,
          skills TEXT,
          drops TEXT,
          location TEXT,
          image_url TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Skills table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS skills (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          level INTEGER,
          cooldown INTEGER,
          description TEXT,
          effects TEXT,
          requirements TEXT,
          image_url TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Quests table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS quests (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          level_requirement INTEGER,
          description TEXT,
          objectives TEXT,
          rewards TEXT,
          npc TEXT,
          location TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Crawl sessions table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS crawl_sessions (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL,
          status TEXT DEFAULT 'running',
          start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
          end_time DATETIME,
          items_found INTEGER DEFAULT 0,
          monsters_found INTEGER DEFAULT 0,
          skills_found INTEGER DEFAULT 0,
          quests_found INTEGER DEFAULT 0,
          errors TEXT
        )
      `);
    });
  }

  // Start a new crawl session
  startCrawlSession(accountId) {
    const sessionId = uuidv4();
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO crawl_sessions (id, account_id) VALUES (?, ?)',
        [sessionId, accountId],
        function(err) {
          if (err) reject(err);
          else resolve(sessionId);
        }
      );
    });
  }

  // Update crawl session status
  updateCrawlSession(sessionId, updates) {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(sessionId);

    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE crawl_sessions SET ${fields} WHERE id = ?`,
        values,
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Add or update an item
  upsertItem(itemData) {
    const { id, name, type, rarity, level, stats, description, image_url, source } = itemData;
    
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT OR REPLACE INTO items 
        (id, name, type, rarity, level, stats, description, image_url, source, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [id, name, type, rarity, level, JSON.stringify(stats), description, image_url, source],
      function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Add or update a monster
  upsertMonster(monsterData) {
    const { id, name, level, hp, attack, defense, skills, drops, location, image_url } = monsterData;
    
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT OR REPLACE INTO monsters 
        (id, name, level, hp, attack, defense, skills, drops, location, image_url, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [id, name, level, hp, attack, defense, JSON.stringify(skills), JSON.stringify(drops), location, image_url],
      function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Add or update a skill
  upsertSkill(skillData) {
    const { id, name, type, level, cooldown, description, effects, requirements, image_url } = skillData;
    
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT OR REPLACE INTO skills 
        (id, name, type, level, cooldown, description, effects, requirements, image_url, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [id, name, type, level, cooldown, description, JSON.stringify(effects), JSON.stringify(requirements), image_url],
      function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Add or update a quest
  upsertQuest(questData) {
    const { id, name, type, level_requirement, description, objectives, rewards, npc, location } = questData;
    
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT OR REPLACE INTO quests 
        (id, name, type, level_requirement, description, objectives, rewards, npc, location, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [id, name, type, level_requirement, description, JSON.stringify(objectives), JSON.stringify(rewards), npc, location],
      function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Get all items with optional filtering
  getItems(filters = {}) {
    return new Promise((resolve, reject) => {
      let query = 'SELECT * FROM items WHERE 1=1';
      const params = [];

      if (filters.type) {
        query += ' AND type = ?';
        params.push(filters.type);
      }
      if (filters.rarity) {
        query += ' AND rarity = ?';
        params.push(filters.rarity);
      }
      if (filters.level) {
        query += ' AND level = ?';
        params.push(filters.level);
      }
      if (filters.levelMin) {
        query += ' AND level >= ?';
        params.push(filters.levelMin);
      }
      if (filters.levelMax) {
        query += ' AND level <= ?';
        params.push(filters.levelMax);
      }

      query += ' ORDER BY name ASC';

      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Get all monsters with optional filtering
  getMonsters(filters = {}) {
    return new Promise((resolve, reject) => {
      let query = 'SELECT * FROM monsters WHERE 1=1';
      const params = [];

      if (filters.level) {
        query += ' AND level = ?';
        params.push(filters.level);
      }
      if (filters.location) {
        query += ' AND location = ?';
        params.push(filters.location);
      }

      query += ' ORDER BY level ASC, name ASC';

      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Get all skills with optional filtering
  getSkills(filters = {}) {
    return new Promise((resolve, reject) => {
      let query = 'SELECT * FROM skills WHERE 1=1';
      const params = [];

      if (filters.type) {
        query += ' AND type = ?';
        params.push(filters.type);
      }
      if (filters.level) {
        query += ' AND level = ?';
        params.push(filters.level);
      }

      query += ' ORDER BY name ASC';

      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Get all quests with optional filtering
  getQuests(filters = {}) {
    return new Promise((resolve, reject) => {
      let query = 'SELECT * FROM quests WHERE 1=1';
      const params = [];

      if (filters.type) {
        query += ' AND type = ?';
        params.push(filters.type);
      }
      if (filters.level_requirement) {
        query += ' AND level_requirement = ?';
        params.push(filters.level_requirement);
      }

      query += ' ORDER BY level_requirement ASC, name ASC';

      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Get crawl session statistics
  getCrawlStats() {
    return new Promise((resolve, reject) => {
      this.db.get(`
        SELECT 
          COUNT(DISTINCT id) as total_items,
          COUNT(DISTINCT (SELECT id FROM monsters)) as total_monsters,
          COUNT(DISTINCT (SELECT id FROM skills)) as total_skills,
          COUNT(DISTINCT (SELECT id FROM quests)) as total_quests,
          COUNT(DISTINCT (SELECT id FROM crawl_sessions WHERE status = 'completed')) as completed_sessions
        FROM items
      `, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  // Search across all tables
  searchAll(query) {
    return new Promise((resolve, reject) => {
      const searchQuery = `%${query}%`;
      
      Promise.all([
        this.searchItems(searchQuery),
        this.searchMonsters(searchQuery),
        this.searchSkills(searchQuery),
        this.searchQuests(searchQuery)
      ]).then(([items, monsters, skills, quests]) => {
        resolve({
          items,
          monsters,
          skills,
          quests,
          total: items.length + monsters.length + skills.length + quests.length
        });
      }).catch(reject);
    });
  }

  searchItems(query) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM items WHERE name LIKE ? OR description LIKE ? ORDER BY name ASC',
        [query, query],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  searchMonsters(query) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM monsters WHERE name LIKE ? OR description LIKE ? ORDER BY name ASC',
        [query, query],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  searchSkills(query) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM skills WHERE name LIKE ? OR description LIKE ? ORDER BY name ASC',
        [query, query],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  searchQuests(query) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM quests WHERE name LIKE ? OR description LIKE ? ORDER BY name ASC',
        [query, query],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  // Close database connection
  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = EncyclopediaService;
