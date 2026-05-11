require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Events, ActivityType, EmbedBuilder } = require('discord.js');

// Commands
const demo = require('./commands/demo');
const review = require('./commands/review');
const { stats, leaderboard } = require('./commands/stats');
const mydemos = require('./commands/mydemos');

// Event handlers
const { handleModalSubmit, handleButtonInteraction } = require('./events/interactions');

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

// ═══ READY ═══
client.once(Events.ClientReady, (c) => {
  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('  VELTRIX BOT — Online');
  console.log(`  Logged in as ${c.user.tag}`);
  console.log(`  Servers: ${c.guilds.cache.size}`);
  console.log('═══════════════════════════════════════');
  console.log('');

  const statuses = [
    { name: 'Submit a demo with /demo', type: ActivityType.Listening },
    { name: 'the demos', type: ActivityType.Listening },
    { name: 'Veltrix Records', type: ActivityType.Watching },
    { name: 'SHAPE THE NOISE', type: ActivityType.Playing },
  ];

  let i = 0;
  const updateStatus = () => {
    client.user.setActivity(statuses[i].name, { type: statuses[i].type });
    i = (i + 1) % statuses.length;
  };
  updateStatus();
  setInterval(updateStatus, 30000);

  // ═══ PENDING REMINDER — check every 24h ═══
  const checkStaleDemos = async () => {
    const db = require('./database/db');
    const staleDemos = db.getDemosNeedingReminder();
    if (staleDemos.length === 0) return;

    const staffChannelId = process.env.STAFF_CHANNEL_ID;
    if (!staffChannelId) return;

    try {
      const staffChannel = await client.channels.fetch(staffChannelId);
      if (!staffChannel) return;

      const lines = staleDemos.map(d =>
        `• \`${d.ticket_id}\` — **${d.track_title}** by **${d.artist_name}** (submitted on ${new Date(d.submitted_at).toLocaleDateString('en-US')})`
      ).join('\n');

      const embed = new EmbedBuilder()
        .setColor(0xFFAA00)
        .setTitle('⏰ Demos without a response for 7+ days')
        .setDescription(lines)
        .setFooter({ text: 'VELTRIX RECORDS — Automatic reminder' })
        .setTimestamp();

      const ping = process.env.AR_ROLE_ID ? `<@&${process.env.AR_ROLE_ID}> ` : '';
      await staffChannel.send({
        content: `${ping}Some demos have been waiting for a response for over a week!`,
        embeds: [embed],
      });

      for (const d of staleDemos) db.markReminderSent(d.ticket_id);

      console.log(`⏰ Reminder sent for ${staleDemos.length} stale demo(s)`);
    } catch (err) {
      console.error('Error sending stale demo reminder:', err);
    }
  };

  setTimeout(checkStaleDemos, 10000);
  setInterval(checkStaleDemos, 24 * 60 * 60 * 1000);
});

// ═══ INTERACTION HANDLER ═══
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
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
