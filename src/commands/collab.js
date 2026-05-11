const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('collab')
    .setDescription('Post a collab request'),

  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId('collab_submit_modal')
      .setTitle('🤝 VELTRIX — Collab Request');

    const genreInput = new TextInputBuilder()
      .setCustomId('collab_genre')
      .setLabel('Genre / Style')
      .setPlaceholder('Phonk, Trap, R&B, Techno...')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(50);

    const linkInput = new TextInputBuilder()
      .setCustomId('collab_link')
      .setLabel('Track link (SoundCloud, Drive...)')
      .setPlaceholder('https://soundcloud.com/...')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const contactInput = new TextInputBuilder()
      .setCustomId('collab_contact')
      .setLabel('Contact / extra info (optional)')
      .setPlaceholder('Your Instagram, Discord tag, or any other info...')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(100);

    modal.addComponents(
      new ActionRowBuilder().addComponents(genreInput),
      new ActionRowBuilder().addComponents(linkInput),
      new ActionRowBuilder().addComponents(contactInput),
    );

    await interaction.showModal(modal);
  },
};
