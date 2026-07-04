require('dotenv').config();
const { REST, Routes } = require('discord.js');

const demo = require('./commands/demo');
const review = require('./commands/review');
const { stats, leaderboard } = require('./commands/stats');
const mydemos = require('./commands/mydemos');
const collab = require('./commands/collab');
const setup = require('./commands/setup');

const commands = [
  demo.data.toJSON(),
  review.data.toJSON(),
  stats.data.toJSON(),
  leaderboard.data.toJSON(),
  mydemos.data.toJSON(),
  collab.data.toJSON(),
  setup.data.toJSON(),
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
    console.error('❌ DISCORD_TOKEN ou CLIENT_ID manquant dans le .env');
    process.exit(1);
  }

  try {
    // GUILD_ID set → deploy to that server only (instant, good for dev).
    // No GUILD_ID → deploy globally so the bot works on every server it joins
    // (Discord can take up to an hour to propagate global commands).
    const guildId = process.env.GUILD_ID;

    if (guildId) {
      console.log(`🔄 Déploiement des commandes sur le serveur ${guildId}...`);
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
        { body: commands },
      );
    } else {
      console.log('🔄 Déploiement GLOBAL des commandes (propagation ≤ 1h)...');
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands },
      );
    }

    console.log('');
    console.log('✅ Commandes déployées avec succès !');
    console.log('');
    console.log('Commandes disponibles :');
    console.log('  /demo          → Soumettre une démo (tout le monde)');
    console.log('  /mydemos       → Voir ses soumissions (tout le monde)');
    console.log('  /leaderboard   → Classement par démos acceptées (tout le monde)');
    console.log('  /collab        → Poster une demande de collab (tout le monde)');
    console.log('  /review        → Gérer les démos (staff)');
    console.log('  /stats         → Dashboard analytics (staff)');
    console.log('  /setup         → Configurer le bot pour CE serveur (admin)');
    console.log('');
    console.log('👉 Maintenant lance le bot avec : npm start');
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
})();
