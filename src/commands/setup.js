const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');
const { getConfig, setConfig, resetConfig } = require('../config/guildConfig');
const { successEmbed, errorEmbed } = require('../utils/embeds');

function fmtChannel(id) { return id ? `<#${id}>` : '*not set*'; }
function fmtRole(id) { return id ? `<@&${id}>` : '*not set*'; }

function configEmbed(guild, cfg) {
  return new EmbedBuilder()
    .setColor(0x000000)
    .setTitle(`⚙️ ${cfg.label_name} — Bot configuration`)
    .setDescription(`Configuration for **${guild.name}**.\nUse \`/setup channels\`, \`/setup roles\` and \`/setup options\` to change it.`)
    .addFields(
      { name: '📥 Staff / demo-review channel', value: fmtChannel(cfg.staff_channel_id), inline: true },
      { name: '🤝 Collab channel', value: fmtChannel(cfg.collab_channel_id), inline: true },
      { name: '​', value: '​', inline: true },
      { name: '📂 Release category', value: cfg.release_category_id ? `<#${cfg.release_category_id}>` : '*not set*', inline: true },
      { name: '📂 Collab category', value: cfg.collab_category_id ? `<#${cfg.collab_category_id}>` : '*not set (uses release category)*', inline: true },
      { name: '​', value: '​', inline: true },
      { name: '🎧 A&R role', value: fmtRole(cfg.ar_role_id), inline: true },
      { name: '🛡️ Staff role', value: fmtRole(cfg.staff_role_id), inline: true },
      { name: '✅ Review role', value: fmtRole(cfg.review_role_id), inline: true },
      { name: '🔥 Score threshold', value: `**${cfg.score_threshold}**`, inline: true },
      { name: '🏷️ Label name', value: cfg.label_name, inline: true },
    )
    .setFooter({ text: 'VTX BOT — per-server configuration' })
    .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure the bot for this server (Admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(sub =>
      sub.setName('view').setDescription('Show the current configuration')
    )
    .addSubcommand(sub =>
      sub.setName('channels')
        .setDescription('Set the channels used by the bot')
        .addChannelOption(opt => opt.setName('staff')
          .setDescription('Private channel where new demos are posted for review')
          .addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addChannelOption(opt => opt.setName('collab')
          .setDescription('Public channel where collab requests are posted')
          .addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addChannelOption(opt => opt.setName('release_category')
          .setDescription('Category where private release channels are created')
          .addChannelTypes(ChannelType.GuildCategory).setRequired(false))
        .addChannelOption(opt => opt.setName('collab_category')
          .setDescription('Category for private collab channels (optional)')
          .addChannelTypes(ChannelType.GuildCategory).setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('roles')
        .setDescription('Set the roles used by the bot')
        .addRoleOption(opt => opt.setName('ar')
          .setDescription('A&R role, pinged on new demos').setRequired(false))
        .addRoleOption(opt => opt.setName('staff')
          .setDescription('Staff role with access to release channels').setRequired(false))
        .addRoleOption(opt => opt.setName('review')
          .setDescription('Role allowed to accept/reject demos').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('options')
        .setDescription('Set misc options')
        .addIntegerOption(opt => opt.setName('score_threshold')
          .setDescription('Vote score that triggers a staff notification (default 5)')
          .setMinValue(1).setMaxValue(100).setRequired(false))
        .addStringOption(opt => opt.setName('label_name')
          .setDescription('Your label name, shown in bot embeds')
          .setMaxLength(60).setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('reset').setDescription('Delete this server\'s configuration')
    ),

  async execute(interaction) {
    // Runtime double-check: setDefaultMemberPermissions can be overridden per-server
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ embeds: [errorEmbed('Permission denied', 'Only administrators can configure the bot.')], ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'view') {
      return interaction.reply({ embeds: [configEmbed(interaction.guild, getConfig(guildId))], ephemeral: true });
    }

    if (sub === 'reset') {
      resetConfig(guildId);
      return interaction.reply({ embeds: [successEmbed('Configuration reset', 'All settings for this server have been cleared. Run `/setup channels` and `/setup roles` to reconfigure.')], ephemeral: true });
    }

    if (sub === 'channels') {
      const staff = interaction.options.getChannel('staff');
      const collab = interaction.options.getChannel('collab');
      const releaseCat = interaction.options.getChannel('release_category');
      const collabCat = interaction.options.getChannel('collab_category');

      if (!staff && !collab && !releaseCat && !collabCat) {
        return interaction.reply({ embeds: [errorEmbed('Nothing to change', 'Provide at least one channel option.')], ephemeral: true });
      }

      // The bot must be able to post in the channels it is given
      const me = interaction.guild.members.me;
      for (const ch of [staff, collab].filter(Boolean)) {
        const perms = ch.permissionsFor(me);
        if (!perms?.has(PermissionFlagsBits.ViewChannel) || !perms?.has(PermissionFlagsBits.SendMessages)) {
          return interaction.reply({ embeds: [errorEmbed('Missing bot permissions', `I can't post in <#${ch.id}>. Give me **View Channel** and **Send Messages** there first.`)], ephemeral: true });
        }
      }

      const patch = {};
      if (staff) patch.staff_channel_id = staff.id;
      if (collab) patch.collab_channel_id = collab.id;
      if (releaseCat) patch.release_category_id = releaseCat.id;
      if (collabCat) patch.collab_category_id = collabCat.id;
      setConfig(guildId, patch);

      return interaction.reply({
        embeds: [successEmbed('Channels saved', 'Channel configuration updated.'), configEmbed(interaction.guild, getConfig(guildId))],
        ephemeral: true,
      });
    }

    if (sub === 'roles') {
      const ar = interaction.options.getRole('ar');
      const staffRole = interaction.options.getRole('staff');
      const review = interaction.options.getRole('review');

      if (!ar && !staffRole && !review) {
        return interaction.reply({ embeds: [errorEmbed('Nothing to change', 'Provide at least one role option.')], ephemeral: true });
      }

      const patch = {};
      if (ar) patch.ar_role_id = ar.id;
      if (staffRole) patch.staff_role_id = staffRole.id;
      if (review) patch.review_role_id = review.id;
      setConfig(guildId, patch);

      return interaction.reply({
        embeds: [successEmbed('Roles saved', 'Role configuration updated.'), configEmbed(interaction.guild, getConfig(guildId))],
        ephemeral: true,
      });
    }

    if (sub === 'options') {
      const threshold = interaction.options.getInteger('score_threshold');
      const labelName = interaction.options.getString('label_name');

      if (threshold === null && !labelName) {
        return interaction.reply({ embeds: [errorEmbed('Nothing to change', 'Provide at least one option.')], ephemeral: true });
      }

      const patch = {};
      if (threshold !== null) patch.score_threshold = threshold;
      if (labelName) patch.label_name = labelName.trim();
      setConfig(guildId, patch);

      return interaction.reply({
        embeds: [successEmbed('Options saved', 'Options updated.'), configEmbed(interaction.guild, getConfig(guildId))],
        ephemeral: true,
      });
    }
  },
};
