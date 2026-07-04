const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const { getConfig } = require('../config/guildConfig');
const { statsEmbed } = require('../utils/embeds');

const stats = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Label stats dashboard (Staff)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const cfg = getConfig(interaction.guildId);
    const data = db.getStats(interaction.guildId);
    return interaction.reply({ embeds: [statsEmbed(data, { labelName: cfg.label_name })] });
  },
};

const leaderboard = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Top artists — ranked by accepted demos'),

  async execute(interaction) {
    await interaction.deferReply();

    const entries = db.getLeaderboardByAccepted(interaction.guildId);
    const cfg = getConfig(interaction.guildId);

    if (entries.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(0x000000)
        .setTitle('🏆 Leaderboard')
        .setDescription('No artists in the leaderboard yet.\nSubmit a demo with `/demo`!')
        .setFooter({ text: cfg.label_name });
      return interaction.editReply({ embeds: [embed] });
    }

    const medals = ['🥇', '🥈', '🥉'];

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
      const label = count === 1 ? 'accepted demo' : 'accepted demos';
      return `${medal} <@${e.discord_user_id}> — **${count}** ${label}`;
    });

    const topUser = userDataMap[entries[0].discord_user_id];

    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle(`🏆 Leaderboard — ${cfg.label_name} Artists`)
      .setDescription(lines.join('\n'))
      .setFooter({ text: `Ranked by accepted demos • ${cfg.label_name}` })
      .setTimestamp();

    if (topUser) embed.setThumbnail(topUser.displayAvatarURL({ size: 256 }));

    return interaction.editReply({ embeds: [embed] });
  },
};

module.exports = { stats, leaderboard };
