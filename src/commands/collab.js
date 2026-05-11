const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('collab')
    .setDescription('Post a collab request in the collab channel')
    .addStringOption(opt =>
      opt.setName('description')
        .setDescription('Describe what you\'re looking for (genre, style, instruments...)')
        .setRequired(true)
        .setMaxLength(500)
    )
    .addStringOption(opt =>
      opt.setName('link')
        .setDescription('Link to your track (SoundCloud, Drive...)')
        .setRequired(false)
    )
    .addAttachmentOption(opt =>
      opt.setName('file')
        .setDescription('Upload your audio file directly')
        .setRequired(false)
    ),

  async execute(interaction) {
    const description = interaction.options.getString('description');
    const link = interaction.options.getString('link');
    const file = interaction.options.getAttachment('file');

    if (!link && !file) {
      return interaction.reply({
        content: '❌ Please provide at least a **link** or an **audio file**.',
        ephemeral: true,
      });
    }

    const collabChannelId = process.env.COLLAB_CHANNEL_ID;
    if (!collabChannelId) {
      return interaction.reply({ content: '❌ COLLAB_CHANNEL_ID not configured.', ephemeral: true });
    }

    const collabChannel = await interaction.client.channels.fetch(collabChannelId).catch(() => null);
    if (!collabChannel) {
      return interaction.reply({ content: '❌ Collab channel not found.', ephemeral: true });
    }

    const { id: collabId } = db.createCollab({
      guildId: interaction.guild.id,
      creatorUserId: interaction.user.id,
      creatorUsername: interaction.user.username,
      description,
      trackLink: link || (file ? file.url : null),
    });

    const embed = new EmbedBuilder()
      .setColor(0x9B59B6)
      .setTitle('🤝 Collab Request')
      .setDescription(description)
      .addFields({ name: '👤 Posted by', value: `<@${interaction.user.id}>`, inline: true });

    if (link) embed.addFields({ name: '🎵 Track', value: link, inline: true });
    if (file) embed.addFields({ name: '📎 File', value: file.name, inline: true });

    embed
      .setFooter({ text: 'Click Participate if you\'re interested!' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`collab_join_${collabId}`)
        .setLabel('🤝 Participate')
        .setStyle(ButtonStyle.Primary)
    );

    const msgOptions = { embeds: [embed], components: [row] };
    if (file) msgOptions.files = [{ attachment: file.url, name: file.name }];

    const msg = await collabChannel.send(msgOptions);
    db.setCollabMessage(collabId, msg.id);

    await interaction.reply({
      content: `✅ Your collab request has been posted in <#${collabChannelId}>!`,
      ephemeral: true,
    });
  },
};
