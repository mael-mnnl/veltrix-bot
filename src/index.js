require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Events, ActivityType, EmbedBuilder } = require('discord.js');

// Commands
const demo = require('./commands/demo');
const review = require('./commands/review');
const { stats, leaderboard } = require('./commands/stats');
const mydemos = require('./commands/mydemos');
const collab = require('./commands/collab');
const setup = require('./commands/setup');

// Event handlers
const { handleModalSubmit, handleButtonInteraction } = require('./events/interactions');
const { getConfig } = require('./config/guildConfig');

// ═══ CLIENT SETUP ═══
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

// Register commands
client.commands = new Collection();
client.commands.set(demo.data.name, demo);
client.commands.set(review.data.name, review);
client.commands.set(stats.data.name, stats);
client.commands.set(leaderboard.data.name, leaderboard);
client.commands.set(mydemos.data.name, mydemos);
client.commands.set(collab.data.name, collab);
client.commands.set(setup.data.name, setup);

// ═══ READY ═══
client.once(Events.ClientReady, (c) => {
  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('  VTX BOT — Online');
  console.log(`  Logged in as ${c.user.tag}`);
  console.log(`  Servers: ${c.guilds.cache.size}`);
  console.log('═══════════════════════════════════════');
  console.log('');

  const statuses = [
    { name: 'Submit a demo with /demo', type: ActivityType.Listening },
    { name: 'the demos', type: ActivityType.Listening },
    { name: '/setup to configure me', type: ActivityType.Watching },
    { name: 'SHAPE THE NOISE', type: ActivityType.Playing },
  ];

  let i = 0;
  const updateStatus = () => {
    client.user.setActivity(statuses[i].name, { type: statuses[i].type });
    i = (i + 1) % statuses.length;
  };
  updateStatus();
  setInterval(updateStatus, 30000);

  // ═══ PENDING REMINDER — check every 24h, per guild ═══
  const checkStaleDemos = async () => {
    const db = require('./database/db');
    const staleDemos = db.getDemosNeedingReminder();
    if (staleDemos.length === 0) return;

    // Group stale demos by the guild they were submitted in
    const byGuild = new Map();
    for (const d of staleDemos) {
      const gid = d.guild_id || process.env.GUILD_ID;
      if (!gid) continue;
      if (!byGuild.has(gid)) byGuild.set(gid, []);
      byGuild.get(gid).push(d);
    }

    for (const [guildId, demos] of byGuild) {
      const cfg = getConfig(guildId);
      if (!cfg.staff_channel_id) continue;

      try {
        const staffChannel = await client.channels.fetch(cfg.staff_channel_id);
        if (!staffChannel) continue;

        const lines = demos.map(d =>
          `• \`${d.ticket_id}\` — **${d.track_title}** by **${d.artist_name}** (submitted on ${new Date(d.submitted_at).toLocaleDateString('en-US')})`
        ).join('\n');

        const embed = new EmbedBuilder()
          .setColor(0xFFAA00)
          .setTitle('⏰ Demos without a response for 7+ days')
          .setDescription(lines)
          .setFooter({ text: `${cfg.label_name} — Automatic reminder` })
          .setTimestamp();

        const ping = cfg.ar_role_id ? `<@&${cfg.ar_role_id}> ` : '';
        await staffChannel.send({
          content: `${ping}Some demos have been waiting for a response for over a week!`,
          embeds: [embed],
        });

        for (const d of demos) db.markReminderSent(d.ticket_id);

        console.log(`⏰ Reminder sent for ${demos.length} stale demo(s) in guild ${guildId}`);
      } catch (err) {
        console.error(`Error sending stale demo reminder for guild ${guildId}:`, err);
      }
    }
  };

  setTimeout(checkStaleDemos, 10000);
  setInterval(checkStaleDemos, 24 * 60 * 60 * 1000);
});

// ═══ WELCOME MESSAGE — when the bot joins a new server ═══
client.on(Events.GuildCreate, async (guild) => {
  console.log(`➕ Joined new guild: ${guild.name} (${guild.id})`);
  try {
    const embed = new EmbedBuilder()
      .setColor(0x000000)
      .setTitle('🎵 VTX Bot — Thanks for adding me!')
      .setDescription(
        'I manage demo submissions, A&R voting and collabs for your label.\n\n' +
        '**Get started (admins):**\n' +
        '1. `/setup channels staff:#demo-review` — where new demos are posted\n' +
        '2. `/setup roles ar:@A&R staff:@Staff` — who gets pinged and who can review\n' +
        '3. `/setup options label_name:Your Label` — brand the bot embeds\n' +
        '4. `/setup view` — check everything\n\n' +
        'Then anyone can submit with `/demo`. 🎧'
      )
      .setFooter({ text: 'VTX PLATFORM — bot module' });

    // Post in the system channel if the bot can, otherwise DM the owner
    const target = guild.systemChannel?.permissionsFor(guild.members.me)?.has('SendMessages')
      ? guild.systemChannel
      : await guild.fetchOwner().then(o => o.user).catch(() => null);
    if (target) await target.send({ embeds: [embed] });
  } catch (err) {
    console.error('Error sending welcome message:', err);
  }
});

// ═══ INTERACTION HANDLER ═══
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      // All commands operate on a server's data — refuse DMs
      if (!interaction.inGuild()) {
        return interaction.reply({ content: '❌ This command only works inside a server.', ephemeral: true });
      }
      await command.execute(interaction);
    }
    else if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction);
    }
    else if (interaction.isButton()) {
      await handleButtonInteraction(interaction);
    }
  } catch (error) {
    console.error('❌ Interaction error:', error);
    const errorMessage = '❌ An error occurred. Please try again!';
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    } catch (e) {}
  }
});

// ═══ LOGIN ═══
if (!process.env.DISCORD_TOKEN) {
  console.error('');
  console.error('❌ DISCORD_TOKEN missing!');
  console.error('   Copy .env.example → .env and fill in the values.');
  console.error('');
  process.exit(1);
}

const db = require('./database/db');
db.initDb().then(() => {
  client.login(process.env.DISCORD_TOKEN);
}).catch(err => {
  console.error('❌ DB init error:', err);
  process.exit(1);
});
