const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// DB_PATH env var lets hosts mount the DB on a persistent volume (Railway, Docker…)
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'veltrix.db');

let db = null;
let dbReady = null;

function initDb() {
  if (dbReady) return dbReady;
  dbReady = (async () => {
    const SQL = await initSqlJs();
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }
    initTables();
    console.log('✅ Base de données SQLite prête');
    return db;
  })();
  return dbReady;
}

function save() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function initTables() {
  db.run(`CREATE TABLE IF NOT EXISTS demos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT UNIQUE NOT NULL,
    discord_user_id TEXT NOT NULL,
    discord_username TEXT NOT NULL,
    artist_name TEXT NOT NULL,
    track_title TEXT NOT NULL,
    genre TEXT DEFAULT 'Non spécifié',
    demo_link TEXT NOT NULL,
    contact TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','reviewing','accepted','rejected')),
    assigned_to TEXT DEFAULT NULL,
    votes_up INTEGER DEFAULT 0,
    votes_down INTEGER DEFAULT 0,
    thread_id TEXT DEFAULT NULL,
    message_id TEXT DEFAULT NULL,
    submitted_at DATETIME DEFAULT (datetime('now')),
    reviewed_at DATETIME DEFAULT NULL,
    review_comment TEXT DEFAULT NULL,
    reviewed_by TEXT DEFAULT NULL,
    reminder_sent INTEGER DEFAULT 0
  );`);
  db.run(`CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    demo_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    vote TEXT NOT NULL CHECK(vote IN ('up','down')),
    voted_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (demo_id) REFERENCES demos(id),
    UNIQUE(demo_id, user_id)
  );`);
  db.run(`CREATE TABLE IF NOT EXISTS collabs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT,
    guild_id TEXT NOT NULL,
    creator_user_id TEXT NOT NULL,
    creator_username TEXT NOT NULL,
    description TEXT NOT NULL,
    track_link TEXT,
    created_at DATETIME DEFAULT (datetime('now'))
  );`);
  db.run(`CREATE TABLE IF NOT EXISTS collab_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collab_id INTEGER NOT NULL,
    requester_user_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined')),
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (collab_id) REFERENCES collabs(id),
    UNIQUE(collab_id, requester_user_id)
  );`);
  db.run(`CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id TEXT PRIMARY KEY,
    label_name TEXT DEFAULT NULL,
    staff_channel_id TEXT DEFAULT NULL,
    collab_channel_id TEXT DEFAULT NULL,
    release_category_id TEXT DEFAULT NULL,
    collab_category_id TEXT DEFAULT NULL,
    ar_role_id TEXT DEFAULT NULL,
    staff_role_id TEXT DEFAULT NULL,
    review_role_id TEXT DEFAULT NULL,
    score_threshold INTEGER DEFAULT NULL,
    updated_at DATETIME DEFAULT (datetime('now'))
  );`);
  try { db.run(`ALTER TABLE demos ADD COLUMN reminder_sent INTEGER DEFAULT 0`); } catch(e) {}
  try { db.run(`ALTER TABLE demos ADD COLUMN guild_id TEXT DEFAULT NULL`); } catch(e) {}
  // Legacy single-guild installs: attach existing demos to the env-configured guild
  if (process.env.GUILD_ID) {
    db.run(`UPDATE demos SET guild_id = ? WHERE guild_id IS NULL`, [process.env.GUILD_ID]);
  }
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_demos_status ON demos(status);`); } catch(e) {}
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_demos_ticket ON demos(ticket_id);`); } catch(e) {}
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_demos_user ON demos(discord_user_id);`); } catch(e) {}
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_demos_guild ON demos(guild_id);`); } catch(e) {}
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_votes_demo ON votes(demo_id);`); } catch(e) {}
  save();
}

// ═══ HELPERS ═══
function rowToObj(stmt) {
  const cols = stmt.getColumnNames();
  const results = [];
  while (stmt.step()) {
    const row = stmt.get();
    const obj = {};
    cols.forEach((col, i) => { obj[col] = row[i]; });
    results.push(obj);
  }
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results = rowToObj(stmt);
  return results[0] || null;
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  return rowToObj(stmt);
}

function run(sql, params = []) {
  db.run(sql, params);
  save();
}

// ═══ DEMO CRUD ═══
function generateTicketId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'VTX-';
  for (let i = 0; i < 5; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function createDemo({ guildId, discordUserId, discordUsername, artistName, trackTitle, genre, demoLink, contact, notes }) {
  const ticketId = generateTicketId();
  run(
    `INSERT INTO demos (ticket_id, guild_id, discord_user_id, discord_username, artist_name, track_title, genre, demo_link, contact, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ticketId, guildId || null, discordUserId, discordUsername, artistName, trackTitle, genre || 'Non spécifié', demoLink, contact || '', notes || '']
  );
  const demo = queryOne('SELECT id FROM demos WHERE ticket_id = ?', [ticketId]);
  return { id: demo.id, ticketId };
}

function getDemo(ticketId) { return queryOne('SELECT * FROM demos WHERE ticket_id = ?', [ticketId]); }
function getDemoById(id) { return queryOne('SELECT * FROM demos WHERE id = ?', [id]); }

function updateDemoStatus(ticketId, status, reviewedBy, reviewComment) {
  run(`UPDATE demos SET status = ?, reviewed_at = datetime('now'), reviewed_by = ?, review_comment = ? WHERE ticket_id = ?`,
    [status, reviewedBy || null, reviewComment || null, ticketId]);
}

function assignDemo(ticketId, assignedTo) {
  run('UPDATE demos SET assigned_to = ?, status = "reviewing" WHERE ticket_id = ?', [assignedTo, ticketId]);
}

function setDemoThread(ticketId, threadId) { run('UPDATE demos SET thread_id = ? WHERE ticket_id = ?', [threadId, ticketId]); }
function setDemoMessage(ticketId, messageId) { run('UPDATE demos SET message_id = ? WHERE ticket_id = ?', [messageId, ticketId]); }

function deleteDemo(ticketId) {
  const demo = queryOne('SELECT id FROM demos WHERE ticket_id = ?', [ticketId]);
  if (!demo) return;
  run('DELETE FROM votes WHERE demo_id = ?', [demo.id]);
  run('DELETE FROM demos WHERE ticket_id = ?', [ticketId]);
}

function deleteDemosByUser(userId, guildId) {
  const demos = queryAll('SELECT id FROM demos WHERE discord_user_id = ? AND guild_id = ?', [userId, guildId]);
  for (const d of demos) run('DELETE FROM votes WHERE demo_id = ?', [d.id]);
  run('DELETE FROM demos WHERE discord_user_id = ? AND guild_id = ?', [userId, guildId]);
  return demos.length;
}

function deleteDemosByStatus(status, guildId) {
  const demos = queryAll('SELECT id FROM demos WHERE status = ? AND guild_id = ?', [status, guildId]);
  for (const d of demos) run('DELETE FROM votes WHERE demo_id = ?', [d.id]);
  run('DELETE FROM demos WHERE status = ? AND guild_id = ?', [status, guildId]);
  return demos.length;
}

function getDemosNeedingReminder() {
  return queryAll(
    `SELECT * FROM demos WHERE status = 'pending' AND submitted_at <= datetime('now', '-7 days') AND reminder_sent = 0`
  );
}

function markReminderSent(ticketId) {
  run('UPDATE demos SET reminder_sent = 1 WHERE ticket_id = ?', [ticketId]);
}

function getLeaderboardByAccepted(guildId) {
  return queryAll(`
    SELECT discord_user_id, discord_username, COUNT(*) as accepted_count
    FROM demos WHERE status = 'accepted' AND guild_id = ?
    GROUP BY discord_user_id
    ORDER BY accepted_count DESC
    LIMIT 10
  `, [guildId]);
}

// ═══ VOTES ═══
function addVote(demoId, userId, vote) {
  const existing = queryOne('SELECT * FROM votes WHERE demo_id = ? AND user_id = ?', [demoId, userId]);
  if (existing) {
    if (existing.vote === vote) return { changed: false, action: 'same' };
    run('UPDATE votes SET vote = ?, voted_at = datetime("now") WHERE demo_id = ? AND user_id = ?', [vote, demoId, userId]);
    if (vote === 'up') run('UPDATE demos SET votes_up = votes_up + 1, votes_down = votes_down - 1 WHERE id = ?', [demoId]);
    else run('UPDATE demos SET votes_down = votes_down + 1, votes_up = votes_up - 1 WHERE id = ?', [demoId]);
    return { changed: true, action: 'switched' };
  }
  run('INSERT INTO votes (demo_id, user_id, vote) VALUES (?, ?, ?)', [demoId, userId, vote]);
  if (vote === 'up') run('UPDATE demos SET votes_up = votes_up + 1 WHERE id = ?', [demoId]);
  else run('UPDATE demos SET votes_down = votes_down + 1 WHERE id = ?', [demoId]);
  return { changed: true, action: 'new' };
}

// ═══ QUERIES (scoped per guild) ═══
function getDemosByStatus(guildId, status, limit = 25) {
  return queryAll('SELECT * FROM demos WHERE guild_id = ? AND status = ? ORDER BY submitted_at DESC LIMIT ?', [guildId, status, limit]);
}
function getDemosByUser(userId, guildId) {
  return queryAll('SELECT * FROM demos WHERE discord_user_id = ? AND guild_id = ? ORDER BY submitted_at DESC', [userId, guildId]);
}
function getAllDemos(guildId, limit = 50) {
  return queryAll('SELECT * FROM demos WHERE guild_id = ? ORDER BY submitted_at DESC LIMIT ?', [guildId, limit]);
}
function searchDemos(guildId, query) {
  const like = `%${query}%`;
  return queryAll(
    `SELECT * FROM demos WHERE guild_id = ? AND (artist_name LIKE ? OR track_title LIKE ? OR ticket_id LIKE ? OR genre LIKE ?) ORDER BY submitted_at DESC LIMIT 25`,
    [guildId, like, like, like, like]
  );
}

// ═══ STATS (scoped per guild) ═══
function getStats(guildId) {
  const count = (sql, params = []) => queryOne(sql, [guildId, ...params]).count;
  const total = count('SELECT COUNT(*) as count FROM demos WHERE guild_id = ?');
  const pending = count("SELECT COUNT(*) as count FROM demos WHERE guild_id = ? AND status = 'pending'");
  const reviewing = count("SELECT COUNT(*) as count FROM demos WHERE guild_id = ? AND status = 'reviewing'");
  const accepted = count("SELECT COUNT(*) as count FROM demos WHERE guild_id = ? AND status = 'accepted'");
  const rejected = count("SELECT COUNT(*) as count FROM demos WHERE guild_id = ? AND status = 'rejected'");
  const thisWeek = count("SELECT COUNT(*) as count FROM demos WHERE guild_id = ? AND submitted_at >= datetime('now','-7 days')");
  const topGenres = queryAll('SELECT genre, COUNT(*) as count FROM demos WHERE guild_id = ? GROUP BY genre ORDER BY count DESC LIMIT 5', [guildId]);
  const recentAccepted = queryAll("SELECT artist_name, track_title, ticket_id FROM demos WHERE guild_id = ? AND status = 'accepted' ORDER BY reviewed_at DESC LIMIT 5", [guildId]);
  return { total, pending, reviewing, accepted, rejected, thisWeek, topGenres, recentAccepted };
}

function getLeaderboard(guildId) {
  return queryAll(`
    SELECT ticket_id, artist_name, track_title, votes_up, votes_down, (votes_up - votes_down) as score, status
    FROM demos WHERE guild_id = ? AND (votes_up > 0 OR votes_down > 0) ORDER BY score DESC LIMIT 10
  `, [guildId]);
}

// ═══ GUILD SETTINGS ═══
const GUILD_SETTING_KEYS = [
  'label_name', 'staff_channel_id', 'collab_channel_id',
  'release_category_id', 'collab_category_id',
  'ar_role_id', 'staff_role_id', 'review_role_id', 'score_threshold',
];

function getGuildSettings(guildId) {
  return queryOne('SELECT * FROM guild_settings WHERE guild_id = ?', [guildId]);
}

function upsertGuildSettings(guildId, patch) {
  const keys = Object.keys(patch).filter(k => GUILD_SETTING_KEYS.includes(k));
  if (keys.length === 0) return getGuildSettings(guildId);
  const existing = getGuildSettings(guildId);
  if (existing) {
    const sets = keys.map(k => `${k} = ?`).join(', ');
    run(`UPDATE guild_settings SET ${sets}, updated_at = datetime('now') WHERE guild_id = ?`,
      [...keys.map(k => patch[k]), guildId]);
  } else {
    run(`INSERT INTO guild_settings (guild_id, ${keys.join(', ')}) VALUES (?${', ?'.repeat(keys.length)})`,
      [guildId, ...keys.map(k => patch[k])]);
  }
  return getGuildSettings(guildId);
}

function resetGuildSettings(guildId) {
  run('DELETE FROM guild_settings WHERE guild_id = ?', [guildId]);
}

// ═══ COLLABS ═══
function createCollab({ guildId, creatorUserId, creatorUsername, description, trackLink }) {
  run(
    `INSERT INTO collabs (guild_id, creator_user_id, creator_username, description, track_link) VALUES (?, ?, ?, ?, ?)`,
    [guildId, creatorUserId, creatorUsername, description, trackLink || null]
  );
  return queryOne('SELECT id FROM collabs WHERE creator_user_id = ? ORDER BY id DESC LIMIT 1', [creatorUserId]);
}

function getCollabById(id) { return queryOne('SELECT * FROM collabs WHERE id = ?', [id]); }
function getCollabByMessageId(messageId) { return queryOne('SELECT * FROM collabs WHERE message_id = ?', [messageId]); }
function setCollabMessage(id, messageId) { run('UPDATE collabs SET message_id = ? WHERE id = ?', [messageId, id]); }

function createCollabRequest(collabId, requesterUserId) {
  const existing = queryOne('SELECT * FROM collab_requests WHERE collab_id = ? AND requester_user_id = ?', [collabId, requesterUserId]);
  if (existing) return { id: existing.id, alreadyExists: true };
  run('INSERT INTO collab_requests (collab_id, requester_user_id) VALUES (?, ?)', [collabId, requesterUserId]);
  const req = queryOne('SELECT id FROM collab_requests WHERE collab_id = ? AND requester_user_id = ?', [collabId, requesterUserId]);
  return { id: req.id, alreadyExists: false };
}

function getCollabRequest(collabId, requesterId) {
  return queryOne('SELECT * FROM collab_requests WHERE collab_id = ? AND requester_user_id = ?', [collabId, requesterId]);
}

function updateCollabRequestStatus(collabId, requesterId, status) {
  run('UPDATE collab_requests SET status = ? WHERE collab_id = ? AND requester_user_id = ?', [status, collabId, requesterId]);
}

module.exports = {
  initDb, generateTicketId, createDemo, getDemo, getDemoById,
  updateDemoStatus, assignDemo, setDemoThread, setDemoMessage,
  deleteDemo, deleteDemosByUser, deleteDemosByStatus,
  getDemosNeedingReminder, markReminderSent,
  addVote, getDemosByStatus, getDemosByUser, getAllDemos, searchDemos,
  getStats, getLeaderboard, getLeaderboardByAccepted,
  getGuildSettings, upsertGuildSettings, resetGuildSettings,
  createCollab, getCollabById, getCollabByMessageId, setCollabMessage,
  createCollabRequest, getCollabRequest, updateCollabRequestStatus,
};
