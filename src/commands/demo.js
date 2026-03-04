const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('demo')
    .setDescription('Submit a demo to Veltrix Records'),

  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId('demo_submit_modal')
      .setTitle('🎵 VELTRIX — Demo Submission');

    const artistInput = new TextInputBuilder()
      .setCustomId('artist_name')
      .setLabel('Artist name')
      .setPlaceholder('Your stage name')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100);

    const titleInput = new TextInputBuilder()
      .setCustomId('track_title')
      .setLabel('Track title')
      .setPlaceholder('Name of your track')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(200);

    const genreInput = new TextInputBuilder()
      .setCustomId('genre')
      .setLabel('Genre')
      .setPlaceholder('Phonk, Funk, Techno, Experimental...')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(50);

    const linkInput = new TextInputBuilder()
      .setCustomId('demo_link')
      .setLabel('Demo link')
      .setPlaceholder('https://soundcloud.com/... or https://drive.google.com/...')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const notesInput = new TextInputBuilder()
      .setCustomId('notes')
      .setLabel('Notes / Contact (optional)')
      .setPlaceholder('Your @ on Instagram, email, or a message for the team...')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(500);

    modal.addComponents(
      new ActionRowBuilder().addComponents(artistInput),
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(genreInput),
      new ActionRowBuilder().addComponents(linkInput),
      new ActionRowBuilder().addComponents(notesInput),
    );

    await interaction.showModal(modal);
  },
};
