const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database/db');
const { getConfig } = require('../config/guildConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('collab')
    .setDescription('Post a collab request')
    .addAttachmentOption(opt =>
      opt.setName('file')
        .setDescription('Upload your audio file (mp3, wav, ogg...)')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('genre')
        .setDescription('Genre / Style (Phonk, Trap, R&B...)')
        .setRequired(false)
        .setMaxLength(50)
    )
    .addStringOption(opt =>
      opt.setName('contact')
        .setDescription('Contact info (Instagram, Discord tag...)')
        .setRequired(false)
        .setMaxLength(100)
    ),

  async execute(interaction) {
    const file = interaction.options.getAttachment('file');
    const genre = interaction.options.getString('genre');
    const contact = interaction.options.getString('contact');

    const collabChannelId = getConfig(interaction.guildId).collab_channel_id;
    if (!collabChannelId) {
      return interaction.reply({ content: '❌ No collab channel configured on this server. An admin must run `/setup channels collab:#channel` first.', ephemeral: true });
    }

    const collabChannel = await interaction.client.channels.fetch(collabChannelId).catch(() => null);
    if (!collabChannel) {
      return interaction.reply({ content: '❌ Collab channel not found.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const { id: collabId } = db.createCollab({
      guildId: interaction.guild.id,
      creatorUserId: interaction.user.id,
      creatorUsername: interaction.user.username,
      description: genre || 'No genre specified',
      trackLink: file.url,
    });

    const embed = new EmbedBuilder()
      .setColor(0x9B59B6)
      .setTitle('🤝 Collab Request')
      .addFields({ name: '👤 Posted by', value: `<@${interaction.user.id}>`, inline: true });

    if (genre) embed.addFields({ name: '🎭 Genre', value: genre, inline: true });
    if (contact) embed.addFields({ name: '📬 Contact', value: contact, inline: true });

    embed
      .setThumbnail(interaction.user.displayAvatarURL({ size: 256 }))
      .setFooter({ text: 'Click Participate if you\'re interested!' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`collab_join_${collabId}`)
        .setLabel('🤝 Participate')
        .setStyle(ButtonStyle.Primary),
    );

    const msg = await collabChannel.send({
      embeds: [embed],
      components: [row],
      files: [{ attachment: file.url, name: file.name }],
    });

    db.setCollabMessage(collabId, msg.id);

    await interaction.editReply({
      content: `✅ Your collab request has been posted in <#${collabChannelId}>!`,
    });
  },
};
