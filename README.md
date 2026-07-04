# 🎵 VTX BOT — Système de gestion des démos

Bot Discord multi-serveur pour labels indépendants (module bot de la plateforme VTX). Gère les soumissions de démos avec un système de tickets, votes A&R, salons de release automatiques, collabs et suivi de statut.

**Multi-tenant** : le même bot peut tourner sur autant de serveurs que nécessaire. Chaque serveur configure ses propres salons, rôles, seuils et nom de label avec `/setup` — rien n'est codé en dur.

---

## 🚀 Setup rapide (5 min)

### 1. Créer le bot sur Discord

1. Va sur [discord.com/developers/applications](https://discord.com/developers/applications)
2. Clique **"New Application"** → Nomme-le `VTX Bot`
3. Va dans **"Bot"** (menu gauche) → **"Reset Token"** → Copie le token
4. Dans **"Bot"**, active ces intents :
   - ✅ SERVER MEMBERS INTENT
   - ✅ MESSAGE CONTENT INTENT
5. Va dans **"OAuth2"** → copie le **Client ID**
6. Invite le bot sur un serveur avec ce lien (remplace `CLIENT_ID`) :
   ```
   https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&permissions=268520528&scope=bot%20applications.commands
   ```
   > Permissions demandées : gérer les salons, envoyer des messages, créer des threads, intégrer des liens, joindre des fichiers.

### 2. Configurer le bot (côté hébergeur)

```bash
cd veltrix-bot
cp .env.example .env
```

Édite le `.env` et remplis **uniquement** :
- `DISCORD_TOKEN` → le token copié à l'étape 3
- `CLIENT_ID` → le client ID copié à l'étape 5

C'est tout. Les salons et rôles ne sont **plus** dans le `.env` : ils se configurent par serveur (étape 4).

### 3. Installer et lancer

```bash
npm install
node src/deploy-commands.js   # Enregistre les commandes slash (GLOBAL par défaut)
npm start                     # Lance le bot
```

> 💡 En dev, mets `GUILD_ID=ton_serveur` dans le `.env` avant `deploy-commands` : les commandes apparaissent instantanément sur ce serveur au lieu d'attendre la propagation globale (≤ 1h).

Pour le dev avec auto-reload :
```bash
npm run dev
```

### 4. Configurer chaque serveur (côté client — admin Discord)

Quand le bot rejoint un serveur, il poste automatiquement les instructions. Un **administrateur** lance :

```
/setup channels staff:#demo-review collab:#collabs release_category:📀 Releases
/setup roles ar:@A&R staff:@Staff review:@Reviewer
/setup options score_threshold:5 label_name:Mon Label
/setup view      ← vérifier la config
/setup reset     ← tout effacer
```

Le bot vérifie qu'il peut écrire dans les salons fournis avant de les enregistrer. Le nom du label apparaît dans tous les embeds (white-label).

---

## 📋 Commandes

### Pour tout le monde
| Commande | Description |
|----------|-------------|
| `/demo` | Ouvre le formulaire de soumission de démo |
| `/mydemos` | Voir le statut de tes soumissions (sur ce serveur) |
| `/leaderboard` | Classement des artistes par démos acceptées |
| `/collab` | Poster une demande de collab |

### Pour le staff
| Commande | Description |
|----------|-------------|
| `/review accept <ticket>` | Accepter une démo |
| `/review reject <ticket>` | Refuser une démo |
| `/review assign <ticket> <user>` | Assigner un reviewer |
| `/review view <ticket>` | Détails d'une démo |
| `/review list [statut]` | Lister les démos |
| `/review search <query>` | Rechercher une démo |
| `/review clean` | Nettoyer la base |
| `/stats` | Dashboard avec analytics |

### Pour les admins
| Commande | Description |
|----------|-------------|
| `/setup view` | Voir la configuration du serveur |
| `/setup channels` | Définir les salons (staff, collab, catégories) |
| `/setup roles` | Définir les rôles (A&R, staff, review) |
| `/setup options` | Seuil de votes, nom du label |
| `/setup reset` | Réinitialiser la configuration |

---

## 🔄 Workflow

```
Artiste tape /demo
       ↓
Formulaire modal s'ouvre (artiste, titre, genre, lien, notes)
       ↓
Ticket créé (ex: VTX-A3B2C)
       ↓
Message posté dans le salon staff configuré via /setup :
  • Embed avec toutes les infos
  • Boutons 👍 / 👎 pour voter
  • Bouton 🎧 Écouter (lien direct)
  • Bouton ✅ Accepter / ❌ Refuser
  • Bouton 💬 Ouvrir un thread de discussion
       ↓
L'équipe A&R vote et discute dans le thread
       ↓
Staff accepte ou refuse → L'artiste reçoit un DM
       ↓
Si accepté → salon privé de release créé automatiquement
```

---

## 🔒 Sécurité & multi-tenancy

- **Isolation par serveur** : les démos, stats, leaderboards et recherches sont scopés au serveur. Un staff du serveur A ne peut ni voir ni manipuler les tickets du serveur B, même en devinant un ID.
- **Permissions** : `/setup` est réservé aux administrateurs (vérifié aussi côté runtime). Accepter/refuser demande le rôle review, A&R, staff ou la permission "Gérer les messages".
- **Validation** : le bot vérifie qu'il a le droit d'écrire dans les salons donnés à `/setup` avant de les enregistrer.
- **Fallback legacy** : les anciennes variables `.env` (STAFF_CHANNEL_ID…) ne s'appliquent qu'au serveur `GUILD_ID` pour ne jamais fuiter d'un serveur à l'autre.

---

## 📊 Base de données

SQLite stockée dans `veltrix.db` (créée automatiquement au premier lancement). Définis `DB_PATH` pour la placer sur un volume persistant (Railway, Docker…).

**Tables :**
- `demos` — Toutes les soumissions avec statut, votes, assignation, `guild_id`
- `votes` — Votes individuels de chaque membre A&R
- `collabs` / `collab_requests` — Demandes de collaboration
- `guild_settings` — Configuration par serveur (salons, rôles, seuil, nom du label)

Les installations existantes migrent automatiquement : la colonne `guild_id` est ajoutée et les anciennes démos sont rattachées au serveur `GUILD_ID` du `.env`.

---

## 🏗️ Structure du projet

```
veltrix-bot/
├── .env.example          ← Template de config (token + client ID seulement)
├── package.json
├── veltrix.db            ← Base de données (auto-créée)
└── src/
    ├── index.js          ← Point d'entrée du bot
    ├── deploy-commands.js ← Enregistrement des commandes (global ou par serveur)
    ├── commands/
    │   ├── demo.js       ← /demo (soumission)
    │   ├── review.js     ← /review (gestion staff)
    │   ├── stats.js      ← /stats + /leaderboard
    │   ├── mydemos.js    ← /mydemos (suivi artiste)
    │   ├── collab.js     ← /collab (demandes de collab)
    │   └── setup.js      ← /setup (config par serveur, admin)
    ├── config/
    │   └── guildConfig.js ← Config par serveur + helpers de permissions
    ├── database/
    │   └── db.js         ← SQLite + toutes les requêtes (scopées par serveur)
    ├── events/
    │   └── interactions.js ← Handlers modals + boutons
    └── utils/
        └── embeds.js     ← Embeds stylisés (white-label)
```

---

## 💡 Tips

- **Hébergement** : [Railway](https://railway.app) ou un VPS. Pense à `DB_PATH` sur un volume persistant.
- **Backup** : Le fichier `veltrix.db` contient toute la data, sauvegarde-le régulièrement.
- **Migration** : Si la plateforme grandit, tu peux migrer vers PostgreSQL — la structure SQL est compatible.
