const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'veltrix.db');

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
  try { db.run(`ALTER TABLE demos ADD COLUMN reminder_sent INTEGER DEFAULT 0`); } catch(e) {}
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_demos_status ON demos(status);`); } catch(e) {}
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_demos_ticket ON demos(ticket_id);`); } catch(e) {}
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_demos_user ON demos(discord_user_id);`); } catch(e) {}
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

function createDemo({ discordUserId, discordUsername, artistName, trackTitle, genre, demoLink, contact, notes }) {
  const ticketId = generateTicketId();
  run(
    `INSERT INTO demos (ticket_id, discord_user_id, discord_username, artist_name, track_title, genre, demo_link, contact, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ticketId, discordUserId, discordUsername, artistName, trackTitle, genre || 'Non spécifié', demoLink, contact || '', notes || '']
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

function deleteDemosByUser(userId) {
  const demos = queryAll('SELECT id FROM demos WHERE discord_user_id = ?', [userId]);
  for (const d of demos) run('DELETE FROM votes WHERE demo_id = ?', [d.id]);
  run('DELETE FROM demos WHERE discord_user_id = ?', [userId]);
  return demos.length;
}

function deleteDemosByStatus(status) {
  const demos = queryAll('SELECT id FROM demos WHERE status = ?', [status]);
  for (const d of demos) run('DELETE FROM votes WHERE demo_id = ?', [d.id]);
  run('DELETE FROM demos WHERE status = ?', [status]);
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

function getLeaderboardByAccepted() {
  return queryAll(`
    SELECT discord_user_id, discord_username, COUNT(*) as accepted_count
    FROM demos WHERE status = 'accepted'
    GROUP BY discord_user_id
    ORDER BY accepted_count DESC
    LIMIT 10
  `);
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

// ═══ QUERIES ═══
function getDemosByStatus(status, limit = 25) {
  return queryAll('SELECT * FROM demos WHERE status = ? ORDER BY submitted_at DESC LIMIT ?', [status, limit]);
}
function getDemosByUser(userId) {
  return queryAll('SELECT * FROM demos WHERE discord_user_id = ? ORDER BY submitted_at DESC', [userId]);
}
function getAllDemos(limit = 50) {
  return queryAll('SELECT * FROM demos ORDER BY submitted_at DESC LIMIT ?', [limit]);
}
function searchDemos(query) {
  const like = `%${query}%`;
  return queryAll(
    `SELECT * FROM demos WHERE artist_name LIKE ? OR track_title LIKE ? OR ticket_id LIKE ? OR genre LIKE ? ORDER BY submitted_at DESC LIMIT 25`,
    [like, like, like, like]
  );
}

// ═══ STATS ═══
function getStats() {
  const total = queryOne('SELECT COUNT(*) as count FROM demos').count;
  const pending = queryOne("SELECT COUNT(*) as count FROM demos WHERE status = 'pending'").count;
  const reviewing = queryOne("SELECT COUNT(*) as count FROM demos WHERE status = 'reviewing'").count;
  const accepted = queryOne("SELECT COUNT(*) as count FROM demos WHERE status = 'accepted'").count;
  const rejected = queryOne("SELECT COUNT(*) as count FROM demos WHERE status = 'rejected'").count;
  const thisWeek = queryOne("SELECT COUNT(*) as count FROM demos WHERE submitted_at >= datetime('now','-7 days')").count;
  const topGenres = queryAll('SELECT genre, COUNT(*) as count FROM demos GROUP BY genre ORDER BY count DESC LIMIT 5');
  const recentAccepted = queryAll("SELECT artist_name, track_title, ticket_id FROM demos WHERE status = 'accepted' ORDER BY reviewed_at DESC LIMIT 5");
  return { total, pending, reviewing, accepted, rejected, thisWeek, topGenres, recentAccepted };
}

function getLeaderboard() {
  return queryAll(`
    SELECT ticket_id, artist_name, track_title, votes_up, votes_down, (votes_up - votes_down) as score, status
    FROM demos WHERE votes_up > 0 OR votes_down > 0 ORDER BY score DESC LIMIT 10
  `);
}

module.exports = {
  initDb, generateTicketId, createDemo, getDemo, getDemoById,
  updateDemoStatus, assignDemo, setDemoThread, setDemoMessage,
  deleteDemo, deleteDemosByUser, deleteDemosByStatus,
  getDemosNeedingReminder, markReminderSent,
  addVote, getDemosByStatus, getDemosByUser, getAllDemos, searchDemos,
  getStats, getLeaderboard, getLeaderboardByAccepted,
};
