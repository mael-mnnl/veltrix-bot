const db = require('../database/db');

// Per-guild config, stored in the guild_settings table via /setup.
// The .env values are only used as a fallback for the guild named by
// GUILD_ID (legacy single-server installs) — never for other guilds,
// otherwise channel/role IDs from one server would leak into another.

const ENV_FALLBACK = {
  staff_channel_id: 'STAFF_CHANNEL_ID',
  collab_channel_id: 'COLLAB_CHANNEL_ID',
  release_category_id: 'RELEASE_CATEGORY_ID',
  collab_category_id: 'COLLAB_CATEGORY_ID',
  ar_role_id: 'AR_ROLE_ID',
  staff_role_id: 'STAFF_ROLE_ID',
  review_role_id: 'REVIEW_ROLE_ID',
};

const DEFAULT_LABEL_NAME = process.env.LABEL_NAME || 'VELTRIX RECORDS';
const DEFAULT_SCORE_THRESHOLD = 5;

function getConfig(guildId) {
  const row = guildId ? db.getGuildSettings(guildId) : null;
  const envApplies = process.env.GUILD_ID && guildId === process.env.GUILD_ID;

  const cfg = {};
  for (const [key, envKey] of Object.entries(ENV_FALLBACK)) {
    cfg[key] = (row && row[key]) || (envApplies ? process.env[envKey] : null) || null;
  }
  cfg.label_name = (row && row.label_name) || DEFAULT_LABEL_NAME;
  cfg.score_threshold = (row && row.score_threshold)
    || parseInt(process.env.SCORE_THRESHOLD, 10)
    || DEFAULT_SCORE_THRESHOLD;
  // Collab channels fall back to the release category when unset
  cfg.collab_category_id = cfg.collab_category_id || cfg.release_category_id;
  return cfg;
}

function setConfig(guildId, patch) {
  return db.upsertGuildSettings(guildId, patch);
}

function resetConfig(guildId) {
  db.resetGuildSettings(guildId);
}

// ═══ PERMISSION HELPERS ═══
// Staff = ManageMessages permission OR the configured staff role.
function isStaff(member, cfg) {
  if (!member) return false;
  if (member.permissions?.has('ManageMessages')) return true;
  return !!(cfg.staff_role_id && member.roles.cache.has(cfg.staff_role_id));
}

// Reviewer = staff, A&R role, or the dedicated review role.
function canReview(member, cfg) {
  if (!member) return false;
  if (isStaff(member, cfg)) return true;
  if (cfg.ar_role_id && member.roles.cache.has(cfg.ar_role_id)) return true;
  return !!(cfg.review_role_id && member.roles.cache.has(cfg.review_role_id));
}

module.exports = { getConfig, setConfig, resetConfig, isStaff, canReview };
