require('dotenv').config();
const { REST, Routes } = require('discord.js');

const demo = require('./commands/demo');
const review = require('./commands/review');
const { stats, leaderboard } = require('./commands/stats');
const mydemos = require('./commands/mydemos');

const commands = [
  demo.data.toJSON(),
  review.data.toJSON(),
  stats.data.toJSON(),
  leaderboard.data.toJSON(),
  mydemos.data.toJSON(),
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID || !process.env.GUILD_ID) {
    console.error('❌ Il manque DISCORD_TOKEN, CLIENT_ID ou GUILD_ID dans le .env');
    process.exit(1);
  }

  try {
    console.log('🔄 Déploiement des commandes slash...');

    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands },
    );

    console.log('');
    console.log('✅ Commandes déployées avec succès !');
    console.log('');
    console.log('Commandes disponibles :');
    console.log('  /demo          → Soumettre une démo (tout le monde)');
    console.log('  /mydemos       → Voir ses soumissions (tout le monde)');
    console.log('  /leaderboard   → Classement par votes (tout le monde)');
    console.log('  /review        → Gérer les démos (staff)');
    console.log('  /stats         → Dashboard analytics (staff)');
    console.log('');
    console.log('👉 Maintenant lance le bot avec : npm start');
  } catch (error) {
    console.error('❌ Erreur:', error);
  }
})();
