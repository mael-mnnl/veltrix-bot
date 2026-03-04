const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
const db = require('../database/db');
const { demoEmbed, successEmbed, errorEmbed, infoEmbed } = require('../utils/embeds');

// ═══════════════════════════════════════════════════════
// MODAL SUBMISSIONS
// ═══════════════════════════════════════════════════════

async function handleModalSubmit(interaction) {

  // ═══ DEMO SUBMISSION MODAL ═══
  if (interaction.customId === 'demo_submit_modal') {
    const artistName = interaction.fields.getTextInputValue('artist_name');
    const trackTitle = interaction.fields.getTextInputValue('track_title');
    const genre = interaction.fields.getTextInputValue('genre') || 'Not specified';
    const demoLink = interaction.fields.getTextInputValue('demo_link');
    const notes = interaction.fields.getTextInputValue('notes') || '';

    if (!demoLink.startsWith('http')) {
      return interaction.reply({
        embeds: [errorEmbed('Invalid link', 'The link must start with `http://` or `https://`.')],
        ephemeral: true,
      });
    }

    const { id, ticketId } = db.createDemo({
      discordUserId: interaction.user.id,
      discordUsername: interaction.user.username,
      artistName,
      trackTitle,
      genre,
      demoLink,
      contact: '',
      notes,
    });

    await interaction.reply({
      embeds: [successEmbed(
        'Demo submitted!',
        `Your track **${trackTitle}** has been received.\n\n🎫 Your ticket: \`${ticketId}\`\nUse \`/mydemos\` to track the status.\n\nThe A&R team will listen to it soon. 🎧`
      )],
      ephemeral: true,
    });

    // Post in staff channel
    const staffChannelId = process.env.STAFF_CHANNEL_ID;
    if (!staffChannelId) { console.log('⚠️ No STAFF_CHANNEL_ID set'); return; }

    try {
      const staffChannel = await interaction.client.channels.fetch(staffChannelId);
      if (!staffChannel) { console.log('⚠️ Could not fetch staff channel'); return; }

      // Build embed directly from form data (no DB re-query needed)
      const { EmbedBuilder } = require('discord.js');
      const embed = new EmbedBuilder()
        .setColor(0x555555)
        .setTitle(`⏳ ${trackTitle}`)
        .setDescription(`by **${artistName}**`)
        .addFields(
          { name: '🎫 Ticket', value: `\`${ticketId}\``, inline: true },
          { name: '🎭 Genre', value: genre, inline: true },
          { name: '📊 Status', value: '⏳ Pending', inline: true },
          { name: '🔗 Link', value: demoLink },
          { name: '🗳️ Votes', value: '👍 0 / 👎 0 (Score: **0**)', inline: true },
        );
      if (notes) embed.addFields({ name: '📝 Notes', value: notes });
      embed
        .setFooter({ text: `Submitted by ${interaction.user.username} • VELTRIX RECORDS` })
        .setTimestamp();

      const arRolePing = process.env.AR_ROLE_ID ? `<@&${process.env.AR_ROLE_ID}> ` : '';

      // Vote buttons + listen link
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`vote_up_${id}`)
          .setLabel('👍 Yes')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`vote_down_${id}`)
          .setLabel('👎 No')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setLabel('🎧 Listen')
          .setStyle(ButtonStyle.Link)
          .setURL(demoLink),
      );

      // Action buttons (opens modals with reason field)
      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`demo_accept_${ticketId}`)
          .setLabel('✅ Accept')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`demo_reject_${ticketId}`)
          .setLabel('❌ Reject')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`demo_thread_${ticketId}`)
          .setLabel('💬 Open thread')
          .setStyle(ButtonStyle.Secondary),
      );

      const msg = await staffChannel.send({
        content: `${arRolePing}🆕 New demo received!`,
        embeds: [embed],
        components: [row, row2],
      });

      db.setDemoMessage(ticketId, msg.id);
      console.log(`✅ Demo ${ticketId} posted in staff channel`);
    } catch (err) {
      console.error('Error sending to staff channel:', err);
    }
  }

  // ═══ ACCEPT MODAL (with reason) ═══
  else if (interaction.customId.startsWith('accept_reason_')) {
    const ticketId = interaction.customId.replace('accept_reason_', '');
    const reason = interaction.fields.getTextInputValue('reason') || '';
    const demo = db.getDemo(ticketId);

    if (!demo) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });

    db.updateDemoStatus(ticketId, 'accepted', interaction.user.id, reason || null);
    const updated = db.getDemo(ticketId);

    // Update the original message — remove buttons, update embed
    try {
      const staffChannel = await interaction.client.channels.fetch(process.env.STAFF_CHANNEL_ID);
      if (staffChannel && demo.message_id) {
        const originalMsg = await staffChannel.messages.fetch(demo.message_id);
        const embed = demoEmbed(updated, { showVotes: true, showStatus: true });
        await originalMsg.edit({ embeds: [embed], components: [] });
      }
    } catch (e) {}

    // ═══ CREATE RELEASE CHANNEL ═══
    let releaseChannel = null;
    const categoryId = process.env.RELEASE_CATEGORY_ID;
    const staffRoleId = process.env.STAFF_ROLE_ID;
    const arRoleId = process.env.AR_ROLE_ID;

    if (categoryId) {
      try {
        const guild = interaction.guild;
        const artistName = demo.artist_name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').substring(0, 20);
        const trackName = demo.track_title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').substring(0, 20);
        const channelName = `${artistName}-${trackName}`;

        // Permission overwrites: deny @everyone, allow artist + staff + AR
        const permissionOverwrites = [
          {
            id: guild.id, // @everyone
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: demo.discord_user_id, // the artist
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory],
          },
        ];

        if (staffRoleId) {
          permissionOverwrites.push({
            id: staffRoleId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory],
          });
        }

        if (arRoleId && arRoleId !== staffRoleId) {
          permissionOverwrites.push({
            id: arRoleId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory],
          });
        }

        releaseChannel = await guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: categoryId,
          permissionOverwrites,
        });

        // Welcome message in the release channel
        const welcomeEmbed = successEmbed(
          `Release — ${demo.track_title}`,
          `Welcome <@${demo.discord_user_id}>! 🎉\n\nYour demo **${demo.track_title}** has been accepted by the Veltrix team.\n\n` +
          `**🎫 Ticket:** \`${demo.ticket_id}\`\n` +
          `**🎭 Genre:** ${demo.genre}\n` +
          `**🔗 Demo:** ${demo.demo_link}\n\n` +
          `This is your private channel to coordinate the release with the team. Feel free to share:\n` +
          `• Final masters / stems\n` +
          `• Artwork\n` +
          `• Release date preferences\n` +
          `• Any questions\n\n` +
          `Let's make this one go viral. 🔥`
        );

        await releaseChannel.send({
          content: `<@${demo.discord_user_id}>${staffRoleId ? ` <@&${staffRoleId}>` : ''}${arRoleId ? ` <@&${arRoleId}>` : ''}`,
          embeds: [welcomeEmbed],
        });

      } catch (err) {
        console.error('Error creating release channel:', err);
      }
    }

    // DM the artist
    try {
      const artist = await interaction.client.users.fetch(demo.discord_user_id);
      let dmText = `**${demo.track_title}** has been approved by Veltrix Records! We'll be in touch soon. 🔥`;
      if (reason) dmText += `\n\n💬 *"${reason}"*`;
      if (releaseChannel) dmText += `\n\n📌 A private channel has been created for your release: <#${releaseChannel.id}>`;
      await artist.send({ embeds: [successEmbed('Your demo has been accepted! 🎉', dmText)] });
    } catch (e) {}

    // Update thread if exists
    if (demo.thread_id) {
      try {
        const thread = await interaction.client.channels.fetch(demo.thread_id);
        if (thread) await thread.send({ embeds: [successEmbed('Demo accepted ✅', `Approved by <@${interaction.user.id}>${reason ? `\n💬 ${reason}` : ''}${releaseChannel ? `\n📌 Release channel: <#${releaseChannel.id}>` : ''}`)] });
      } catch (e) {}
    }

    const channelMention = releaseChannel ? ` Release channel: <#${releaseChannel.id}>` : '';
    await interaction.reply({ content: `✅ **${demo.track_title}** by **${demo.artist_name}** accepted! Artist notified.${channelMention}`, ephemeral: true });
  }

  // ═══ REJECT MODAL (with reason) ═══
  else if (interaction.customId.startsWith('reject_reason_')) {
    const ticketId = interaction.customId.replace('reject_reason_', '');
    const reason = interaction.fields.getTextInputValue('reason') || '';
    const demo = db.getDemo(ticketId);

    if (!demo) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });

    db.updateDemoStatus(ticketId, 'rejected', interaction.user.id, reason || null);
    const updated = db.getDemo(ticketId);

    // Update the original message
    try {
      const staffChannel = await interaction.client.channels.fetch(process.env.STAFF_CHANNEL_ID);
      if (staffChannel && demo.message_id) {
        const originalMsg = await staffChannel.messages.fetch(demo.message_id);
        const embed = demoEmbed(updated, { showVotes: true, showStatus: true });
        await originalMsg.edit({ embeds: [embed], components: [] });
      }
    } catch (e) {}

    // DM the artist
    try {
      const artist = await interaction.client.users.fetch(demo.discord_user_id);
      let dmText = `**${demo.track_title}** was not selected this time. Don't give up, keep submitting! 💪`;
      if (reason) dmText += `\n\n💬 *"${reason}"*`;
      await artist.send({ embeds: [errorEmbed('Demo not selected', dmText)] });
    } catch (e) {}

    // Update thread if exists
    if (demo.thread_id) {
      try {
        const thread = await interaction.client.channels.fetch(demo.thread_id);
        if (thread) await thread.send({ embeds: [errorEmbed('Demo rejected', `By <@${interaction.user.id}>${reason ? `\n💬 ${reason}` : ''}`)] });
      } catch (e) {}
    }

    await interaction.reply({ content: `❌ **${demo.track_title}** by **${demo.artist_name}** rejected. Artist notified.`, ephemeral: true });
  }
}

// ═══════════════════════════════════════════════════════
// BUTTON INTERACTIONS
// ═══════════════════════════════════════════════════════

async function handleButtonInteraction(interaction) {
  const customId = interaction.customId;

  // ═══ VOTE BUTTONS ═══
  if (customId.startsWith('vote_up_') || customId.startsWith('vote_down_')) {
    const voteType = customId.startsWith('vote_up_') ? 'up' : 'down';
    const demoId = parseInt(customId.replace(`vote_${voteType}_`, ''));

    const result = db.addVote(demoId, interaction.user.id, voteType);
    const demo = db.getDemoById(demoId);

    if (!demo) return interaction.reply({ content: '❌ Demo not found.', ephemeral: true });

    if (!result.changed) {
      return interaction.reply({ content: `You already voted ${voteType === 'up' ? '👍' : '👎'} on this demo.`, ephemeral: true });
    }

    const embed = demoEmbed(demo, { showVotes: true, showStatus: true });
    await interaction.update({ embeds: [embed] });
  }

  // ═══ ACCEPT BUTTON → Opens modal with reason field ═══
  else if (customId.startsWith('demo_accept_')) {
    const ticketId = customId.replace('demo_accept_', '');

    if (!interaction.member.permissions.has('ManageMessages')) {
      return interaction.reply({ content: '❌ You don\'t have permission to do this.', ephemeral: true });
    }

    const modal = new ModalBuilder()
      .setCustomId(`accept_reason_${ticketId}`)
      .setTitle('✅ Accept Demo');

    const reasonInput = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('Message to the artist (optional)')
      .setPlaceholder('e.g. Great track! We\'ll contact you soon for the release...')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(500);

    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
    await interaction.showModal(modal);
  }

  // ═══ REJECT BUTTON → Opens modal with reason field ═══
  else if (customId.startsWith('demo_reject_')) {
    const ticketId = customId.replace('demo_reject_', '');

    if (!interaction.member.permissions.has('ManageMessages')) {
      return interaction.reply({ content: '❌ You don\'t have permission to do this.', ephemeral: true });
    }

    const modal = new ModalBuilder()
      .setCustomId(`reject_reason_${ticketId}`)
      .setTitle('❌ Reject Demo');

    const reasonInput = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('Reason / feedback for the artist (optional)')
      .setPlaceholder('e.g. The mix needs work, try resubmitting after adjustments...')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(500);

    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
    await interaction.showModal(modal);
  }

  // ═══ THREAD BUTTON ═══
  else if (customId.startsWith('demo_thread_')) {
    const ticketId = customId.replace('demo_thread_', '');
    const demo = db.getDemo(ticketId);

    if (!demo) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });

    if (demo.thread_id) {
      return interaction.reply({ content: `💬 A thread already exists: <#${demo.thread_id}>`, ephemeral: true });
    }

    try {
      const thread = await interaction.message.startThread({
        name: `${ticketId} — ${demo.artist_name} - ${demo.track_title}`,
        autoArchiveDuration: 4320,
      });

      db.setDemoThread(ticketId, thread.id);

      await thread.send({
        embeds: [infoEmbed(
          `Discussion — ${demo.track_title}`,
          `**Artist:** ${demo.artist_name}\n**Genre:** ${demo.genre}\n**Link:** ${demo.demo_link}\n\nDiscuss this demo here. 🎧`
        )],
      });

      await interaction.reply({ content: `💬 Thread created: <#${thread.id}>`, ephemeral: true });
    } catch (err) {
      console.error('Error creating thread:', err);
      await interaction.reply({ content: '❌ Error creating the thread.', ephemeral: true });
    }
  }
}

module.exports = { handleModalSubmit, handleButtonInteraction };
