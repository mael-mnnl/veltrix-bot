const { EmbedBuilder } = require('discord.js');

const COLORS = {
  primary: 0x000000,
  success: 0x00FF00,
  danger: 0xFF0000,
  warning: 0xFFAA00,
  info: 0x00AAFF,
  pending: 0x555555,
  reviewing: 0xFFAA00,
  accepted: 0x00FF00,
  rejected: 0xFF0000,
};

const STATUS_EMOJI = {
  pending: '⏳',
  reviewing: '🔍',
  accepted: '✅',
  rejected: '❌',
};

const STATUS_LABEL = {
  pending: 'Pending',
  reviewing: 'Under review',
  accepted: 'Accepted',
  rejected: 'Rejected',
};

function demoEmbed(demo, { showVotes = true, showStatus = true } = {}) {
  const embed = new EmbedBuilder()
    .setColor(COLORS[demo.status] || COLORS.primary)
    .setTitle(`${STATUS_EMOJI[demo.status] || '🎵'} ${demo.track_title}`)
    .setDescription(`by **${demo.artist_name}**`)
    .addFields(
      { name: '🎫 Ticket', value: `\`${demo.ticket_id}\``, inline: true },
      { name: '🎭 Genre', value: demo.genre || 'N/A', inline: true },
    );

  if (showStatus) {
    embed.addFields({
      name: '📊 Status',
      value: `${STATUS_EMOJI[demo.status]} ${STATUS_LABEL[demo.status]}`,
      inline: true,
    });
  }

  embed.addFields({ name: '🔗 Link', value: demo.demo_link });

  if (demo.contact) {
    embed.addFields({ name: '📬 Contact', value: demo.contact, inline: true });
  }

  if (demo.notes) {
    embed.addFields({ name: '📝 Notes', value: demo.notes });
  }

  if (showVotes) {
    const score = demo.votes_up - demo.votes_down;
    const scoreDisplay = score > 0 ? `+${score}` : `${score}`;
    embed.addFields({
      name: '🗳️ Votes',
      value: `👍 ${demo.votes_up} / 👎 ${demo.votes_down} (Score: **${scoreDisplay}**)`,
      inline: true,
    });
  }

  if (demo.assigned_to) {
    embed.addFields({ name: '👤 Assigned to', value: `<@${demo.assigned_to}>`, inline: true });
  }

  if (demo.review_comment) {
    embed.addFields({ name: '💬 Review comment', value: demo.review_comment });
  }

  embed
    .setFooter({ text: `Submitted by ${demo.discord_username} • VELTRIX RECORDS` })
    .setTimestamp(new Date(demo.submitted_at));

  return embed;
}

function statsEmbed(stats) {
  const genresText = stats.topGenres.length > 0
    ? stats.topGenres.map((g, i) => `${i + 1}. **${g.genre}** — ${g.count}`).join('\n')
    : 'No data yet';

  const recentText = stats.recentAccepted.length > 0
    ? stats.recentAccepted.map(d => `✅ **${d.artist_name}** — ${d.track_title} (\`${d.ticket_id}\`)`).join('\n')
    : 'No accepted demos yet';

  return new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('📊 VELTRIX RECORDS — Dashboard')
    .addFields(
      { name: '📨 Total demos', value: `**${stats.total}**`, inline: true },
      { name: '📅 This week', value: `**${stats.thisWeek}**`, inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: '⏳ Pending', value: `**${stats.pending}**`, inline: true },
      { name: '🔍 Under review', value: `**${stats.reviewing}**`, inline: true },
      { name: '✅ Accepted', value: `**${stats.accepted}**`, inline: true },
      { name: '❌ Rejected', value: `**${stats.rejected}**`, inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: '🔥 Top Genres', value: genresText },
      { name: '🏆 Recently accepted', value: recentText },
    )
    .setFooter({ text: 'VELTRIX RECORDS • Live stats' })
    .setTimestamp();
}

function leaderboardEmbed(entries) {
  if (entries.length === 0) {
    return new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle('🏆 Demo Leaderboard')
      .setDescription('No votes yet.');
  }

  const medals = ['🥇', '🥈', '🥉'];
  const lines = entries.map((e, i) => {
    const medal = medals[i] || `**${i + 1}.**`;
    const score = e.score > 0 ? `+${e.score}` : `${e.score}`;
    const status = STATUS_EMOJI[e.status] || '';
    return `${medal} **${e.artist_name}** — ${e.track_title} • Score: **${score}** (👍${e.votes_up}/👎${e.votes_down}) ${status}`;
  });

  return new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle('🏆 VELTRIX — Demo Leaderboard')
    .setDescription(lines.join('\n'))
    .setFooter({ text: 'Ranked by A&R team votes' })
    .setTimestamp();
}

function successEmbed(title, description) {
  return new EmbedBuilder().setColor(COLORS.success).setTitle(`✅ ${title}`).setDescription(description);
}

function errorEmbed(title, description) {
  return new EmbedBuilder().setColor(COLORS.danger).setTitle(`❌ ${title}`).setDescription(description);
}

function infoEmbed(title, description) {
  return new EmbedBuilder().setColor(COLORS.info).setTitle(`ℹ️ ${title}`).setDescription(description);
}

module.exports = {
  COLORS, STATUS_EMOJI, STATUS_LABEL,
  demoEmbed, statsEmbed, leaderboardEmbed,
  successEmbed, errorEmbed, infoEmbed,
};
