# 🎵 VELTRIX BOT — Système de gestion des démos

Bot Discord pour Veltrix Records. Gère les soumissions de démos avec un système de tickets, votes A&R, et suivi de statut.

---

## 🚀 Setup rapide (5 min) 

### 1. Créer le bot sur Discord

1. Va sur [discord.com/developers/applications](https://discord.com/developers/applications)
2. Clique **"New Application"** → Nomme-le `Veltrix Bot`
3. Va dans **"Bot"** (menu gauche) → **"Reset Token"** → Copie le token
4. Dans **"Bot"**, active ces intents :
   - ✅ SERVER MEMBERS INTENT
   - ✅ MESSAGE CONTENT INTENT
5. Va dans **"OAuth2"** → copie le **Client ID**
6. Invite le bot sur ton serveur avec ce lien (remplace `CLIENT_ID`) :
   ```
   https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&permissions=8&scope=bot%20applications.commands
   ```

### 2. Configurer le bot

```bash
cd veltrix-bot
cp .env.example .env
```

Édite le `.env` et remplis :
- `DISCORD_TOKEN` → le token copié à l'étape 3
- `CLIENT_ID` → le client ID copié à l'étape 5
- `GUILD_ID` → clic droit sur ton serveur Discord → "Copier l'identifiant"
- `STAFF_CHANNEL_ID` → crée un channel #demo-review privé → clic droit → copier l'ID
- `AR_ROLE_ID` (optionnel) → ID du rôle A&R à ping

> 💡 Pour voir les IDs : Discord → Paramètres → Avancés → Mode développeur ON

### 3. Installer et lancer

```bash
npm install
node src/deploy-commands.js   # Enregistre les commandes slash
npm start                     # Lance le bot
```

Pour le dev avec auto-reload :
```bash
npm run dev
```
---

## 📋 Commandes

### Pour tout le monde
| Commande | Description |
|----------|-------------|
| `/demo` | Ouvre le formulaire de soumission de démo |
| `/mydemos` | Voir le statut de tes soumissions |
| `/leaderboard` | Classement des démos par votes |

### Pour le staff (permission "Gérer les messages")
| Commande | Description |
|----------|-------------|
| `/review accept <ticket>` | Accepter une démo |
| `/review reject <ticket>` | Refuser une démo |
| `/review assign <ticket> <user>` | Assigner un reviewer |
| `/review view <ticket>` | Détails d'une démo |
| `/review list [statut]` | Lister les démos |
| `/review search <query>` | Rechercher une démo |
| `/stats` | Dashboard avec analytics |

---

## 🔄 Workflow

```
Artiste tape /demo
       ↓
Formulaire modal s'ouvre (artiste, titre, genre, lien, notes)
       ↓
Ticket créé (ex: VTX-A3B2C)
       ↓
Message posté dans #demo-review avec :
  • Embed avec toutes les infos
  • Boutons 👍 / 👎 pour voter
  • Bouton 🎧 Écouter (lien direct)
  • Bouton ✅ Accepter / ❌ Refuser
  • Bouton 💬 Ouvrir un thread de discussion
       ↓
L'équipe A&R vote et discute dans le thread
       ↓
Staff accepte ou refuse → L'artiste reçoit un DM
```

---

## 📊 Base de données

SQLite stockée dans `veltrix.db` (créée automatiquement au premier lancement).

**Tables :**
- `demos` — Toutes les soumissions avec statut, votes, assignation
- `votes` — Votes individuels de chaque membre A&R
- `stats` — Log d'événements pour analytics

---

## 🏗️ Structure du projet

```
veltrix-bot/
├── .env.example          ← Template de config
├── .gitignore
├── package.json
├── veltrix.db            ← Base de données (auto-créée)
└── src/
    ├── index.js          ← Point d'entrée du bot
    ├── deploy-commands.js ← Script d'enregistrement des commandes
    ├── commands/
    │   ├── demo.js       ← /demo (soumission)
    │   ├── review.js     ← /review (gestion staff)
    │   ├── stats.js      ← /stats + /leaderboard
    │   └── mydemos.js    ← /mydemos (suivi artiste)
    ├── database/
    │   └── db.js         ← SQLite + toutes les requêtes
    ├── events/
    │   └── interactions.js ← Handlers modals + boutons
    └── utils/
        └── embeds.js     ← Embeds stylisés Veltrix
```

---

## 💡 Tips

- **Hébergement gratuit** : [Railway](https://railway.app) ou un VPS
- **Backup** : Le fichier `veltrix.db` contient toute ta data, sauvegarde-le régulièrement
- **Migration** : Si le label grandit, tu peux migrer vers PostgreSQL — la structure SQL est compatible
