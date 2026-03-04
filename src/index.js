require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Events, ActivityType } = require('discord.js');

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

  // Rotating status
  const statuses = [
    { name: '/demo pour soumettre', type: ActivityType.Listening },
    { name: 'les démos', type: ActivityType.Listening },
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
});

// ═══ INTERACTION HANDLER ═══
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
    }

    // Modal submits (demo form)
    else if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction);
    }

    // Button clicks (votes, accept/reject, thread)
    else if (interaction.isButton()) {
      await handleButtonInteraction(interaction);
    }

  } catch (error) {
    console.error('❌ Interaction error:', error);
    
    const errorMessage = '❌ Une erreur est survenue. Réessaie !';
    
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    } catch (e) {
      // Can't respond at all
    }
  }
});

// ═══ LOGIN ═══
if (!process.env.DISCORD_TOKEN) {
  console.error('');
  console.error('❌ DISCORD_TOKEN manquant !');
  console.error('   Copie .env.example → .env et remplis les valeurs.');
  console.error('');
  process.exit(1);
}

// Init DB (async) then login
const db = require('./database/db');
db.initDb().then(() => {
  client.login(process.env.DISCORD_TOKEN);
}).catch(err => {
  console.error('❌ Erreur init DB:', err);
  process.exit(1);
});
