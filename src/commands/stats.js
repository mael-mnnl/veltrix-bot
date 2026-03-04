const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database/db');
const { statsEmbed, leaderboardEmbed } = require('../utils/embeds');

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
    .setDescription('Demo ranking by votes'),

  async execute(interaction) {
    const entries = db.getLeaderboard();
    return interaction.reply({ embeds: [leaderboardEmbed(entries)] });
  },
};

module.exports = { stats, leaderboard };
