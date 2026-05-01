const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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
        .setTitle('🎵 Tes soumissions')
        .setDescription('Tu n\'as encore soumis aucune démo.\nUtilise `/demo` pour en envoyer une !')
        .setFooter({ text: 'VELTRIX RECORDS' });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const lines = demos.map(d => {
      const emoji = STATUS_EMOJI[d.status] || '🎵';
      const label = STATUS_LABEL[d.status] || d.status;
      const date = new Date(d.submitted_at).toLocaleDateString('fr-FR');
      return `${emoji} \`${d.ticket_id}\` — **${d.track_title}** • ${label} • ${date}`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x000000)
      .setTitle('🎵 Tes soumissions Veltrix')
      .setDescription(lines.join('\n'))
      .setFooter({ text: `${demos.length} soumission(s) au total` })
      .setTimestamp();

    // Cancel buttons for pending demos (up to 5, Discord limit)
    const pendingDemos = demos.filter(d => d.status === 'pending').slice(0, 5);
    const components = pendingDemos.map(d =>
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`demo_cancel_${d.ticket_id}`)
          .setLabel(`Annuler ${d.ticket_id}`)
          .setStyle(ButtonStyle.Danger)
      )
    );

    return interaction.reply({ embeds: [embed], components, ephemeral: true });
  },
};
