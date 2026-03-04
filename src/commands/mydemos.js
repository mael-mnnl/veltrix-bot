const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const { STATUS_EMOJI, STATUS_LABEL } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mydemos')
    .setDescription('Check the status of your submissions'),

  async execute(interaction) {
    const demos = db.getDemosByUser(interaction.user.id);

    if (demos.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(0x555555)
        .setTitle('🎵 Your submissions')
        .setDescription('You haven\'t submitted any demos yet.\nUse `/demo` to send one!')
        .setFooter({ text: 'VELTRIX RECORDS' });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const lines = demos.map(d => {
      const emoji = STATUS_EMOJI[d.status] || '🎵';
      const label = STATUS_LABEL[d.status] || d.status;
      const date = new Date(d.submitted_at).toLocaleDateString('en-US');
      return `${emoji} \`${d.ticket_id}\` — **${d.track_title}** • ${label} • ${date}`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x000000)
      .setTitle('🎵 Your Veltrix submissions')
      .setDescription(lines.join('\n'))
      .setFooter({ text: `${demos.length} submission(s) total` })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
