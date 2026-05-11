const https = require('https');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const { demoEmbed, successEmbed, errorEmbed, infoEmbed } = require('../utils/embeds');

function fetchSCThumbnail(url) {
  return new Promise((resolve) => {
    const oembedUrl = 'https://soundcloud.com/oembed?format=json&url=' + encodeURIComponent(url);
    const req = https.get(oembedUrl, { timeout: 5000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return resolve(null); }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data).thumbnail_url || null); } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(5000, () => { req.destroy(); resolve(null); });
  });
}

function hasReviewPermission(member) {
  const reviewRoleId = process.env.REVIEW_ROLE_ID;
  return reviewRoleId && member.roles.cache.has(reviewRoleId);
}

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

    const staffChannelId = process.env.STAFF_CHANNEL_ID;
    if (!staffChannelId) { console.log('⚠️ No STAFF_CHANNEL_ID set'); return; }

    try {
      const staffChannel = await interaction.client.channels.fetch(staffChannelId);
      if (!staffChannel) { console.log('⚠️ Could not fetch staff channel'); return; }

      const thumbnail = await fetchSCThumbnail(demoLink);

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
      if (thumbnail) embed.setThumbnail(thumbnail);
      embed
        .setFooter({ text: `Submitted by ${interaction.user.username} • VELTRIX RECORDS` })
        .setTimestamp();

      const arRolePing = process.env.AR_ROLE_ID ? `<@&${process.env.AR_ROLE_ID}> ` : '';

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
        const artistSlug = demo.artist_name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').substring(0, 20);
        const trackSlug = demo.track_title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').substring(0, 20);

        const permissionOverwrites = [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          {
            id: demo.discord_user_id,
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
          name: `${artistSlug}-${trackSlug}`,
          type: ChannelType.GuildText,
          parent: categoryId,
          permissionOverwrites,
        });

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
          `Let's go! 🔥`
        );

        const closeRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('close_channel')
            .setLabel('🔒 Close channel')
            .setStyle(ButtonStyle.Danger)
        );

        await releaseChannel.send({
          content: `<@${demo.discord_user_id}>${staffRoleId ? ` <@&${staffRoleId}>` : ''}${arRoleId ? ` <@&${arRoleId}>` : ''}`,
          embeds: [welcomeEmbed],
          components: [closeRow],
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

    try {
      const staffChannel = await interaction.client.channels.fetch(process.env.STAFF_CHANNEL_ID);
      if (staffChannel && demo.message_id) {
        const originalMsg = await staffChannel.messages.fetch(demo.message_id);
        const embed = demoEmbed(updated, { showVotes: true, showStatus: true });
        await originalMsg.edit({ embeds: [embed], components: [] });
      }
    } catch (e) {}

    try {
      const artist = await interaction.client.users.fetch(demo.discord_user_id);
      let dmText = `**${demo.track_title}** was not selected this time. Don't give up, keep submitting! 💪`;
      if (reason) dmText += `\n\n💬 *"${reason}"*`;
      await artist.send({ embeds: [errorEmbed('Demo not selected', dmText)] });
    } catch (e) {}

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

    const demoBefore = db.getDemoById(demoId);
    if (!demoBefore) return interaction.reply({ content: '❌ Demo not found.', ephemeral: true });
    const oldScore = demoBefore.votes_up - demoBefore.votes_down;

    const result = db.addVote(demoId, interaction.user.id, voteType);

    if (!result.changed) {
      return interaction.reply({ content: `You already voted ${voteType === 'up' ? '👍' : '👎'} on this demo.`, ephemeral: true });
    }

    const demo = db.getDemoById(demoId);
    const newScore = demo.votes_up - demo.votes_down;
    const SCORE_THRESHOLD = parseInt(process.env.SCORE_THRESHOLD) || 5;

    const embed = demoEmbed(demo, { showVotes: true, showStatus: true });
    await interaction.update({ embeds: [embed] });

    if (oldScore < SCORE_THRESHOLD && newScore >= SCORE_THRESHOLD) {
      try {
        const staffChannel = await interaction.client.channels.fetch(process.env.STAFF_CHANNEL_ID);
        if (staffChannel) {
          const notifEmbed = new EmbedBuilder()
            .setColor(0xFFD700)
            .setTitle(`🔥 ${demo.track_title} — Score +${newScore}!`)
            .setDescription(`by **${demo.artist_name}** • \`${demo.ticket_id}\`\n\nThis demo has reached the threshold of **+${SCORE_THRESHOLD}** votes. It deserves a decision!`)
            .setTimestamp();
          const ping = process.env.AR_ROLE_ID ? `<@&${process.env.AR_ROLE_ID}> ` : '';
          await staffChannel.send({ content: `${ping}🔥 Score threshold reached!`, embeds: [notifEmbed] });
        }
      } catch (e) {}
    }
  }

  // ═══ ACCEPT BUTTON ═══
  else if (customId.startsWith('demo_accept_')) {
    if (!hasReviewPermission(interaction.member)) {
      return interaction.reply({ content: '❌ You don\'t have permission to do this.', ephemeral: true });
    }

    const ticketId = customId.replace('demo_accept_', '');
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

  // ═══ REJECT BUTTON ═══
  else if (customId.startsWith('demo_reject_')) {
    if (!hasReviewPermission(interaction.member)) {
      return interaction.reply({ content: '❌ You don\'t have permission to do this.', ephemeral: true });
    }

    const ticketId = customId.replace('demo_reject_', '');
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

  // ═══ CANCEL BUTTON (from /mydemos) ═══
  else if (customId.startsWith('demo_cancel_')) {
    const ticketId = customId.replace('demo_cancel_', '');
    const demo = db.getDemo(ticketId);

    if (!demo) return interaction.reply({ content: '❌ Ticket not found.', ephemeral: true });
    if (demo.discord_user_id !== interaction.user.id) {
      return interaction.reply({ content: '❌ This is not your submission.', ephemeral: true });
    }
    if (demo.status !== 'pending') {
      return interaction.reply({ content: `❌ Cannot cancel a demo with status **${demo.status}**.`, ephemeral: true });
    }

    try {
      const staffChannel = await interaction.client.channels.fetch(process.env.STAFF_CHANNEL_ID);
      if (staffChannel && demo.message_id) {
        try {
          const msg = await staffChannel.messages.fetch(demo.message_id);
          await msg.delete();
        } catch (e) {}
      }
    } catch (e) {}

    db.deleteDemo(ticketId);

    await interaction.update({
      content: `✅ Your submission **${demo.track_title}** (\`${ticketId}\`) has been cancelled.`,
      embeds: [],
      components: [],
    });
  }

  // ═══ COLLAB JOIN BUTTON ═══
  else if (customId.startsWith('collab_join_')) {
    const collabId = parseInt(customId.replace('collab_join_', ''));
    const collab = db.getCollabById(collabId);

    if (!collab) return interaction.reply({ content: '❌ Collab not found.', ephemeral: true });

    if (collab.creator_user_id === interaction.user.id) {
      return interaction.reply({ content: '❌ You can\'t participate in your own collab request.', ephemeral: true });
    }

    const { alreadyExists } = db.createCollabRequest(collabId, interaction.user.id);
    if (alreadyExists) {
      return interaction.reply({ content: '⏳ You already sent a request for this collab. Wait for the artist\'s response.', ephemeral: true });
    }

    // DM the collab creator
    try {
      const creator = await interaction.client.users.fetch(collab.creator_user_id);
      const requesterUser = interaction.user;

      const dmEmbed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('🤝 New collab request!')
        .setDescription(`**${requesterUser.username}** wants to collab with you on your request!`)
        .addFields(
          { name: '👤 Requester', value: `<@${requesterUser.id}>`, inline: true },
          { name: '🎵 Your track', value: collab.track_link || 'See attachment', inline: true },
          { name: '📝 Your description', value: collab.description },
        )
        .setThumbnail(requesterUser.displayAvatarURL({ size: 256 }))
        .setTimestamp();

      const dmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`collab_accept_${collabId}_${requesterUser.id}`)
          .setLabel('✅ Accept')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`collab_decline_${collabId}_${requesterUser.id}`)
          .setLabel('❌ Decline')
          .setStyle(ButtonStyle.Danger),
      );

      await creator.send({ embeds: [dmEmbed], components: [dmRow] });
      await interaction.reply({ content: '✅ Your request has been sent! The artist will be notified.', ephemeral: true });
    } catch (e) {
      db.updateCollabRequestStatus(collabId, interaction.user.id, 'declined');
      await interaction.reply({ content: '❌ Could not DM the artist (their DMs may be closed).', ephemeral: true });
    }
  }

  // ═══ COLLAB ACCEPT (from DM) ═══
  else if (customId.startsWith('collab_accept_')) {
    const parts = customId.replace('collab_accept_', '').split('_');
    const collabId = parseInt(parts[0]);
    const requesterId = parts[1];
    const collab = db.getCollabById(collabId);

    if (!collab) return interaction.reply({ content: '❌ Collab not found.', ephemeral: true });

    const existing = db.getCollabRequest(collabId, requesterId);
    if (existing && existing.status !== 'pending') {
      return interaction.update({ content: `This request has already been **${existing.status}**.`, embeds: [], components: [] });
    }

    db.updateCollabRequestStatus(collabId, requesterId, 'accepted');

    // Create private collab channel
    let collabChannel = null;
    try {
      const guild = await interaction.client.guilds.fetch(collab.guild_id);
      const categoryId = process.env.COLLAB_CATEGORY_ID || process.env.RELEASE_CATEGORY_ID;
      const staffRoleId = process.env.STAFF_ROLE_ID;

      const creatorSlug = collab.creator_username.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 12);
      const requesterUser = await interaction.client.users.fetch(requesterId);
      const requesterSlug = requesterUser.username.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 12);

      const permissionOverwrites = [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: collab.creator_user_id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory],
        },
        {
          id: requesterId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory],
        },
      ];

      if (staffRoleId) {
        permissionOverwrites.push({
          id: staffRoleId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory],
        });
      }

      const channelOptions = {
        name: `collab-${creatorSlug}-${requesterSlug}`,
        type: ChannelType.GuildText,
        permissionOverwrites,
      };
      if (categoryId) channelOptions.parent = categoryId;

      collabChannel = await guild.channels.create(channelOptions);

      const welcomeEmbed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('🤝 Collab Channel')
        .setDescription(
          `<@${collab.creator_user_id}> & <@${requesterId}> — your collab is ON! 🔥\n\n` +
          `**Original request:** ${collab.description}\n` +
          (collab.track_link ? `**Track:** ${collab.track_link}\n` : '') +
          `\nUse this channel to share files, ideas, and coordinate your work.`
        )
        .setTimestamp();

      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_channel')
          .setLabel('🔒 Close channel')
          .setStyle(ButtonStyle.Danger)
      );

      await collabChannel.send({
        content: `<@${collab.creator_user_id}> <@${requesterId}>`,
        embeds: [welcomeEmbed],
        components: [closeRow],
      });
    } catch (err) {
      console.error('Error creating collab channel:', err);
    }

    // DM the requester
    try {
      const requesterUser = await interaction.client.users.fetch(requesterId);
      const dmText = collabChannel
        ? `**${collab.creator_username}** accepted your collab request! 🎉\n\n📌 Your private channel: <#${collabChannel.id}>`
        : `**${collab.creator_username}** accepted your collab request! 🎉 They'll reach out to you directly.`;
      await requesterUser.send({ embeds: [new EmbedBuilder().setColor(0x00FF00).setTitle('✅ Collab accepted!').setDescription(dmText)] });
    } catch (e) {}

    await interaction.update({
      content: `✅ You accepted the collab request from <@${requesterId}>!${collabChannel ? ` Channel: <#${collabChannel.id}>` : ''}`,
      embeds: [],
      components: [],
    });
  }

  // ═══ COLLAB DECLINE (from DM) ═══
  else if (customId.startsWith('collab_decline_')) {
    const parts = customId.replace('collab_decline_', '').split('_');
    const collabId = parseInt(parts[0]);
    const requesterId = parts[1];
    const collab = db.getCollabById(collabId);

    if (!collab) return interaction.reply({ content: '❌ Collab not found.', ephemeral: true });

    const existing = db.getCollabRequest(collabId, requesterId);
    if (existing && existing.status !== 'pending') {
      return interaction.update({ content: `This request has already been **${existing.status}**.`, embeds: [], components: [] });
    }

    db.updateCollabRequestStatus(collabId, requesterId, 'declined');

    try {
      const requesterUser = await interaction.client.users.fetch(requesterId);
      await requesterUser.send({
        embeds: [new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('❌ Collab declined')
          .setDescription(`**${collab.creator_username}** declined your collab request this time. Keep creating! 💪`)
        ],
      });
    } catch (e) {}

    await interaction.update({
      content: `❌ You declined the collab request from <@${requesterId}>.`,
      embeds: [],
      components: [],
    });
  }

  // ═══ CLOSE CHANNEL BUTTON ═══
  else if (customId === 'close_channel') {
    const staffRoleId = process.env.STAFF_ROLE_ID;
    const arRoleId = process.env.AR_ROLE_ID;
    const reviewRoleId = process.env.REVIEW_ROLE_ID;

    const isAuth =
      interaction.member.permissions.has('ManageChannels') ||
      (staffRoleId && interaction.member.roles.cache.has(staffRoleId)) ||
      (arRoleId && interaction.member.roles.cache.has(arRoleId)) ||
      (reviewRoleId && interaction.member.roles.cache.has(reviewRoleId));

    if (!isAuth) {
      return interaction.reply({ content: '❌ You don\'t have permission to close this channel.', ephemeral: true });
    }

    try {
      await interaction.channel.delete();
    } catch (err) {
      console.error('Error deleting channel:', err);
      await interaction.reply({ content: '❌ Failed to delete the channel.', ephemeral: true });
    }
  }
}

module.exports = { handleModalSubmit, handleButtonInteraction };
