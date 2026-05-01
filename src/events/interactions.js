const https = require('https');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const { demoEmbed, successEmbed, errorEmbed, infoEmbed } = require('../utils/embeds');

const SC_REGEX = /^https?:\/\/(www\.)?soundcloud\.com\/.+/;

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
  const arRoleId = process.env.AR_ROLE_ID;
  const reviewRoleId = process.env.REVIEW_ROLE_ID;
  return (
    member.permissions.has('ManageMessages') ||
    (arRoleId && member.roles.cache.has(arRoleId)) ||
    (reviewRoleId && member.roles.cache.has(reviewRoleId))
  );
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

    if (!SC_REGEX.test(demoLink)) {
      return interaction.reply({
        embeds: [errorEmbed('Lien invalide', 'Seuls les liens **SoundCloud** sont acceptés.\nEx: `https://soundcloud.com/artiste/titre`')],
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
        'Démo soumise !',
        `Ton track **${trackTitle}** a bien été reçu.\n\n🎫 Ton ticket : \`${ticketId}\`\nUtilise \`/mydemos\` pour suivre le statut.\n\nL'équipe A&R va l'écouter bientôt. 🎧`
      )],
      ephemeral: true,
    });

    // Post in staff channel
    const staffChannelId = process.env.STAFF_CHANNEL_ID;
    if (!staffChannelId) { console.log('⚠️ No STAFF_CHANNEL_ID set'); return; }

    try {
      const staffChannel = await interaction.client.channels.fetch(staffChannelId);
      if (!staffChannel) { console.log('⚠️ Could not fetch staff channel'); return; }

      // Fetch SoundCloud cover art (not stored in DB)
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

      // Second message: raw SoundCloud URL so Discord shows the inline player
      await staffChannel.send({ content: demoLink });

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
          name: channelName,
          type: ChannelType.GuildText,
          parent: categoryId,
          permissionOverwrites,
        });

        const welcomeEmbed = successEmbed(
          `Release — ${demo.track_title}`,
          `Bienvenue <@${demo.discord_user_id}> ! 🎉\n\nTa démo **${demo.track_title}** a été acceptée par l'équipe Veltrix.\n\n` +
          `**🎫 Ticket :** \`${demo.ticket_id}\`\n` +
          `**🎭 Genre :** ${demo.genre}\n` +
          `**🔗 Démo :** ${demo.demo_link}\n\n` +
          `C'est ton salon privé pour coordonner la release avec l'équipe. N'hésite pas à partager :\n` +
          `• Masters finaux / stems\n` +
          `• Artwork\n` +
          `• Préférences de date de sortie\n` +
          `• Toute question\n\n` +
          `Let's go ! 🔥`
        );

        const closeRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('close_channel')
            .setLabel('🔒 Fermer ce salon')
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
      let dmText = `**${demo.track_title}** a été approuvé par Veltrix Records ! On te contacte bientôt. 🔥`;
      if (reason) dmText += `\n\n💬 *"${reason}"*`;
      if (releaseChannel) dmText += `\n\n📌 Un salon privé a été créé pour ta release : <#${releaseChannel.id}>`;
      await artist.send({ embeds: [successEmbed('Ta démo a été acceptée ! 🎉', dmText)] });
    } catch (e) {}

    // Update thread if exists
    if (demo.thread_id) {
      try {
        const thread = await interaction.client.channels.fetch(demo.thread_id);
        if (thread) await thread.send({ embeds: [successEmbed('Démo acceptée ✅', `Approuvée par <@${interaction.user.id}>${reason ? `\n💬 ${reason}` : ''}${releaseChannel ? `\n📌 Salon release : <#${releaseChannel.id}>` : ''}`)] });
      } catch (e) {}
    }

    const channelMention = releaseChannel ? ` Salon release : <#${releaseChannel.id}>` : '';
    await interaction.reply({ content: `✅ **${demo.track_title}** by **${demo.artist_name}** accepté ! Artiste notifié.${channelMention}`, ephemeral: true });
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

    // DM the artist
    try {
      const artist = await interaction.client.users.fetch(demo.discord_user_id);
      let dmText = `**${demo.track_title}** n'a pas été retenu cette fois. Continue à soumettre ! 💪`;
      if (reason) dmText += `\n\n💬 *"${reason}"*`;
      await artist.send({ embeds: [errorEmbed('Démo non retenue', dmText)] });
    } catch (e) {}

    // Update thread if exists
    if (demo.thread_id) {
      try {
        const thread = await interaction.client.channels.fetch(demo.thread_id);
        if (thread) await thread.send({ embeds: [errorEmbed('Démo refusée', `Par <@${interaction.user.id}>${reason ? `\n💬 ${reason}` : ''}`)] });
      } catch (e) {}
    }

    await interaction.reply({ content: `❌ **${demo.track_title}** by **${demo.artist_name}** refusé. Artiste notifié.`, ephemeral: true });
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
      return interaction.reply({ content: `Tu as déjà voté ${voteType === 'up' ? '👍' : '👎'} sur cette démo.`, ephemeral: true });
    }

    const embed = demoEmbed(demo, { showVotes: true, showStatus: true });
    await interaction.update({ embeds: [embed] });
  }

  // ═══ ACCEPT BUTTON → Opens modal with reason field ═══
  else if (customId.startsWith('demo_accept_')) {
    if (!hasReviewPermission(interaction.member)) {
      return interaction.reply({ content: '❌ Tu n\'as pas la permission de faire ça.', ephemeral: true });
    }

    const ticketId = customId.replace('demo_accept_', '');
    const modal = new ModalBuilder()
      .setCustomId(`accept_reason_${ticketId}`)
      .setTitle('✅ Accepter la démo');

    const reasonInput = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('Message à l\'artiste (optionnel)')
      .setPlaceholder('Ex : Super track ! On te contacte bientôt pour la release...')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(500);

    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
    await interaction.showModal(modal);
  }

  // ═══ REJECT BUTTON → Opens modal with reason field ═══
  else if (customId.startsWith('demo_reject_')) {
    if (!hasReviewPermission(interaction.member)) {
      return interaction.reply({ content: '❌ Tu n\'as pas la permission de faire ça.', ephemeral: true });
    }

    const ticketId = customId.replace('demo_reject_', '');
    const modal = new ModalBuilder()
      .setCustomId(`reject_reason_${ticketId}`)
      .setTitle('❌ Refuser la démo');

    const reasonInput = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('Raison / feedback pour l\'artiste (optionnel)')
      .setPlaceholder('Ex : Le mix a besoin de travail, soumets à nouveau après...')
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

    if (!demo) return interaction.reply({ content: '❌ Ticket introuvable.', ephemeral: true });

    if (demo.thread_id) {
      return interaction.reply({ content: `💬 Un thread existe déjà : <#${demo.thread_id}>`, ephemeral: true });
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
          `**Artiste :** ${demo.artist_name}\n**Genre :** ${demo.genre}\n**Lien :** ${demo.demo_link}\n\nDiscutez de cette démo ici. 🎧`
        )],
      });

      await interaction.reply({ content: `💬 Thread créé : <#${thread.id}>`, ephemeral: true });
    } catch (err) {
      console.error('Error creating thread:', err);
      await interaction.reply({ content: '❌ Erreur lors de la création du thread.', ephemeral: true });
    }
  }

  // ═══ CANCEL BUTTON (from /mydemos) ═══
  else if (customId.startsWith('demo_cancel_')) {
    const ticketId = customId.replace('demo_cancel_', '');
    const demo = db.getDemo(ticketId);

    if (!demo) return interaction.reply({ content: '❌ Ticket introuvable.', ephemeral: true });
    if (demo.discord_user_id !== interaction.user.id) {
      return interaction.reply({ content: '❌ Ce n\'est pas ta soumission.', ephemeral: true });
    }
    if (demo.status !== 'pending') {
      return interaction.reply({ content: `❌ Impossible d'annuler une démo avec le statut **${demo.status}**.`, ephemeral: true });
    }

    // Delete the staff channel message (and the SC player message right after it)
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
      content: `✅ Ta soumission **${demo.track_title}** (\`${ticketId}\`) a été annulée.`,
      embeds: [],
      components: [],
    });
  }

  // ═══ CLOSE CHANNEL BUTTON (in release channels) ═══
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
      return interaction.reply({ content: '❌ Tu n\'as pas la permission de fermer ce salon.', ephemeral: true });
    }

    try {
      await interaction.channel.delete();
    } catch (err) {
      console.error('Error deleting channel:', err);
      await interaction.reply({ content: '❌ Impossible de supprimer le salon.', ephemeral: true });
    }
  }
}

module.exports = { handleModalSubmit, handleButtonInteraction };
