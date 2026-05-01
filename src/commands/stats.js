const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const { statsEmbed } = require('../utils/embeds');

const stats = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Veltrix stats dashboard (Staff)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const data = db.getStats();
    return interaction.reply({ embeds: [statsEmbed(data)] });
  },
};

const leaderboard = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Top artistes Veltrix — classement par démos acceptées'),

  async execute(interaction) {
    await interaction.deferReply();

    const entries = db.getLeaderboardByAccepted();

    if (entries.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(0x000000)
        .setTitle('🏆 Leaderboard Veltrix')
        .setDescription('Aucun artiste dans le classement pour l\'instant.\nSoumets une démo avec `/demo` !')
        .setFooter({ text: 'VELTRIX RECORDS' });
      return interaction.editReply({ embeds: [embed] });
    }

    const medals = ['🥇', '🥈', '🥉'];

    // Fetch Discord users for avatars
    const userDataMap = {};
    for (const entry of entries) {
      try {
        userDataMap[entry.discord_user_id] = await interaction.client.users.fetch(entry.discord_user_id);
      } catch (e) {
        userDataMap[entry.discord_user_id] = null;
      }
    }

    const lines = entries.map((e, i) => {
      const medal = medals[i] || `**${i + 1}.**`;
      const count = e.accepted_count;
      const label = count === 1 ? 'démo acceptée' : 'démos acceptées';
      return `${medal} <@${e.discord_user_id}> — **${count}** ${label}`;
    });

    const topUser = userDataMap[entries[0].discord_user_id];

    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('🏆 Leaderboard — Artistes Veltrix')
      .setDescription(lines.join('\n'))
      .setFooter({ text: 'Classé par démos acceptées • VELTRIX RECORDS' })
      .setTimestamp();

    if (topUser) embed.setThumbnail(topUser.displayAvatarURL({ size: 256 }));

    return interaction.editReply({ embeds: [embed] });
  },
};

module.exports = { stats, leaderboard };
