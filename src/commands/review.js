const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const { demoEmbed, successEmbed, errorEmbed, STATUS_EMOJI, STATUS_LABEL } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('review')
    .setDescription('Manage submitted demos (Staff)')
    .setDefaultMemberPermissions(0)
    .addSubcommand(sub =>
      sub.setName('accept')
        .setDescription('Accept a demo')
        .addStringOption(opt => opt.setName('ticket').setDescription('Ticket ID (e.g. VTX-A3B2C)').setRequired(true))
        .addStringOption(opt => opt.setName('comment').setDescription('Comment for the artist (optional)').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('reject')
        .setDescription('Reject a demo')
        .addStringOption(opt => opt.setName('ticket').setDescription('Ticket ID').setRequired(true))
        .addStringOption(opt => opt.setName('comment').setDescription('Reason (optional)').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('assign')
        .setDescription('Assign a demo to a reviewer')
        .addStringOption(opt => opt.setName('ticket').setDescription('Ticket ID').setRequired(true))
        .addUserOption(opt => opt.setName('reviewer').setDescription('The reviewer to assign').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('View demo details')
        .addStringOption(opt => opt.setName('ticket').setDescription('Ticket ID').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List demos by status')
        .addStringOption(opt =>
          opt.setName('status')
            .setDescription('Filter by status')
            .setRequired(false)
            .addChoices(
              { name: '⏳ Pending', value: 'pending' },
              { name: '🔍 Under review', value: 'reviewing' },
              { name: '✅ Accepted', value: 'accepted' },
              { name: '❌ Rejected', value: 'rejected' },
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName('search')
        .setDescription('Search for a demo')
        .addStringOption(opt => opt.setName('query').setDescription('Artist, title, ticket ID, or genre').setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const arRoleId = process.env.AR_ROLE_ID;
    const isStaff = interaction.member.permissions.has('ManageMessages');
    const isAR = interaction.member.roles.cache.has(arRoleId);

    switch (sub) {
      case 'accept': {
        if (!isStaff && !isAR) return interaction.reply({ embeds: [errorEmbed('Permission denied', 'You need to be staff or AR to do this.')], ephemeral: true });
        const ticketId = interaction.options.getString('ticket').toUpperCase();
        const comment = interaction.options.getString('comment');
        const demo = db.getDemo(ticketId);

        if (!demo) return interaction.reply({ embeds: [errorEmbed('Ticket not found', `No demo with ID \`${ticketId}\``)], ephemeral: true });

        db.updateDemoStatus(ticketId, 'accepted', interaction.user.id, comment);
        const updated = db.getDemo(ticketId);

        try {
          const artist = await interaction.client.users.fetch(demo.discord_user_id);
          let dmText = `**${demo.track_title}** has been approved by Veltrix Records! We'll be in touch soon. 🔥`;
          if (comment) dmText += `\n\n💬 *"${comment}"*`;
          await artist.send({ embeds: [successEmbed('Your demo has been accepted! 🎉', dmText)] });
        } catch (e) {}

        if (demo.thread_id) {
          try {
            const thread = await interaction.client.channels.fetch(demo.thread_id);
            if (thread) await thread.send({ embeds: [successEmbed('Demo accepted ✅', `Approved by <@${interaction.user.id}>${comment ? `\n💬 ${comment}` : ''}`)] });
          } catch (e) {}
        }

        return interaction.reply({ embeds: [demoEmbed(updated)], content: `✅ **${demo.track_title}** by **${demo.artist_name}** accepted!` });
      }

      case 'reject': {
        if (!isStaff && !isAR) return interaction.reply({ embeds: [errorEmbed('Permission denied', 'You need to be staff or AR to do this.')], ephemeral: true });
        const ticketId = interaction.options.getString('ticket').toUpperCase();
        const comment = interaction.options.getString('comment');
        const demo = db.getDemo(ticketId);

        if (!demo) return interaction.reply({ embeds: [errorEmbed('Ticket not found', `No demo with ID \`${ticketId}\``)], ephemeral: true });

        db.updateDemoStatus(ticketId, 'rejected', interaction.user.id, comment);
        const updated = db.getDemo(ticketId);

        try {
          const artist = await interaction.client.users.fetch(demo.discord_user_id);
          let dmText = `**${demo.track_title}** was not selected this time. Don't give up, keep submitting! 💪`;
          if (comment) dmText += `\n\n💬 *"${comment}"*`;
          await artist.send({ embeds: [errorEmbed('Demo not selected', dmText)] });
        } catch (e) {}

        if (demo.thread_id) {
          try {
            const thread = await interaction.client.channels.fetch(demo.thread_id);
            if (thread) await thread.send({ embeds: [errorEmbed('Demo rejected', `By <@${interaction.user.id}>${comment ? `\n💬 ${comment}` : ''}`)] });
          } catch (e) {}
        }

        return interaction.reply({ embeds: [demoEmbed(updated)], content: `❌ **${demo.track_title}** by **${demo.artist_name}** rejected.` });
      }

      case 'assign': {
        if (!isStaff) return interaction.reply({ embeds: [errorEmbed('Permission denied', 'You need staff permissions to do this.')], ephemeral: true });
        const ticketId = interaction.options.getString('ticket').toUpperCase();
        const reviewer = interaction.options.getUser('reviewer');
        const demo = db.getDemo(ticketId);

        if (!demo) return interaction.reply({ embeds: [errorEmbed('Ticket not found', `No demo with ID \`${ticketId}\``)], ephemeral: true });

        db.assignDemo(ticketId, reviewer.id);
        const updated = db.getDemo(ticketId);

        return interaction.reply({
          embeds: [demoEmbed(updated)],
          content: `🔍 **${demo.track_title}** assigned to <@${reviewer.id}> for review.`,
        });
      }

      case 'view': {
        if (!isStaff && !isAR) return interaction.reply({ embeds: [errorEmbed('Permission denied', 'You need to be staff or AR to do this.')], ephemeral: true });
        const ticketId = interaction.options.getString('ticket').toUpperCase();
        const demo = db.getDemo(ticketId);

        if (!demo) return interaction.reply({ embeds: [errorEmbed('Ticket not found', `No demo with ID \`${ticketId}\``)], ephemeral: true });

        return interaction.reply({ embeds: [demoEmbed(demo)] });
      }

      case 'list': {
        if (!isStaff && !isAR) return interaction.reply({ embeds: [errorEmbed('Permission denied', 'You need to be staff or AR to do this.')], ephemeral: true });
        const status = interaction.options.getString('status');
        const demos = status ? db.getDemosByStatus(status) : db.getAllDemos();

        if (demos.length === 0) {
          return interaction.reply({ embeds: [errorEmbed('No results', 'No demos found.')], ephemeral: true });
        }

        const lines = demos.slice(0, 20).map(d => {
          const emoji = STATUS_EMOJI[d.status] || '🎵';
          return `${emoji} \`${d.ticket_id}\` — **${d.artist_name}** • ${d.track_title} (👍${d.votes_up}/👎${d.votes_down})`;
        });

        const embed = new EmbedBuilder()
          .setColor(0x000000)
          .setTitle(`📋 Demos ${status ? `(${STATUS_EMOJI[status]} ${status})` : '(all)'}`)
          .setDescription(lines.join('\n'))
          .setFooter({ text: `${demos.length} result(s) • /review view <ticket> for details` })
          .setTimestamp();

        return interaction.reply({ embeds: [embed] });
      }

      case 'search': {
        if (!isStaff && !isAR) return interaction.reply({ embeds: [errorEmbed('Permission denied', 'You need to be staff or AR to do this.')], ephemeral: true });
        const query = interaction.options.getString('query');
        const results = db.searchDemos(query);

        if (results.length === 0) {
          return interaction.reply({ embeds: [errorEmbed('No results', `Nothing found for "${query}".`)], ephemeral: true });
        }

        const lines = results.map(d => {
          const emoji = STATUS_EMOJI[d.status] || '🎵';
          return `${emoji} \`${d.ticket_id}\` — **${d.artist_name}** • ${d.track_title}`;
        });

        const embed = new EmbedBuilder()
          .setColor(0x00AAFF)
          .setTitle(`🔎 Results for "${query}"`)
          .setDescription(lines.join('\n'))
          .setFooter({ text: `${results.length} result(s)` });

        return interaction.reply({ embeds: [embed] });
      }
    }
  },
};
