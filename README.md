# Letterboxd Discord Bot

Bot Discord avec une commande `/film` : pioche un film aleatoire dans ta watchlist Letterboxd
et poste un message avec titre, note (TMDb) et synopsis.

## 1. Prerequis

- Ton profil Letterboxd doit etre **public** (Parametres > Confidentialite sur letterboxd.com),
  sinon le scraping de la watchlist ne fonctionnera pas.
- Un compte Discord Developer + un serveur Discord ou tu es admin.
- Un compte TMDb (gratuit).

## 2. Creer le bot Discord

1. Va sur https://discord.com/developers/applications > **New Application**.
2. Note l'**Application ID** (= `CLIENT_ID`), visible dans "General Information".
3. Va dans l'onglet **Bot** > **Reset Token** > copie le token (= `DISCORD_TOKEN`).
   Attention, ce token n'est affiche qu'une fois.
4. Toujours dans **Bot**, laisse les intents par defaut (pas besoin d'intents privilegies pour ce bot).
5. Va dans **OAuth2 > URL Generator** :
   - Scopes : coche `bot` et `applications.commands`
   - Bot Permissions : coche `Send Messages` et `Embed Links`
   - Copie l'URL generee en bas, ouvre-la dans ton navigateur, et invite le bot sur ton serveur.
6. Recupere l'ID de ton serveur (= `GUILD_ID`) : dans Discord, Parametres > Avance > active le
   **Mode developpeur**, puis clic droit sur le nom du serveur > **Copier l'ID**.

## 3. Creer la cle TMDb

1. Va sur https://www.themoviedb.org/ > cree un compte.
2. Parametres > API > demande une cle API (choix "Developer", usage personnel).
3. Copie la **cle API (v3 auth)** (= `TMDB_API_KEY`).

## 4. Configuration locale

```bash
cp .env.example .env
```

Remplis le fichier `.env` avec :
- `DISCORD_TOKEN`
- `CLIENT_ID`
- `GUILD_ID`
- `LETTERBOXD_USERNAME` (ton pseudo dans l'URL letterboxd.com/tonpseudo/)
- `TMDB_API_KEY`

## 5. Installation et enregistrement de la commande

```bash
npm install
npm run deploy-commands
```

`deploy-commands` n'est a relancer que si tu modifies la commande elle-meme (pas besoin de le
relancer a chaque redemarrage du bot).

## 6. Lancer le bot

```bash
npm start
```

Le bot doit rester **allume en continu** pour que la commande `/film` fonctionne — d'ou l'interet
de l'heberger sur un VPS ou un service comme Railway plutot que sur ton PC perso.

## 7. Deploiement sur Railway (exemple)

1. Push ce dossier sur un repo GitHub (public ou prive).
2. Sur https://railway.app, **New Project > Deploy from GitHub repo**, choisis ton repo.
3. Dans l'onglet **Variables** du service Railway, ajoute les memes variables que dans `.env`
   (`DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `LETTERBOXD_USERNAME`, `TMDB_API_KEY`).
4. Railway detecte automatiquement `npm start` comme commande de demarrage grace au `package.json`.
5. Une fois deploye, connecte-toi une fois en local (ou via le terminal Railway) pour lancer
   `npm run deploy-commands` — ou ajoute-le temporairement comme "Start Command" une seule fois,
   puis remets `npm start` ensuite.

## Utilisation

Une fois le bot en ligne, tape `/film` dans un channel du serveur ou il est present.

Le bot te repond **en prive** (visible uniquement par toi, "ephemeral") avec un film aleatoire
de ta watchlist Letterboxd, sa note TMDb et son synopsis, accompagne de deux boutons :

- **Poster** : publie ce film publiquement dans le channel pour que tout le monde le voie.
- **Changer** : pioche un autre film aleatoire (sans reproposer un film deja vu pendant la meme
  session), toujours visible seulement par toi.

Tu peux cliquer sur "Changer" autant de fois que tu veux avant de te decider, seul "Poster"
rend le choix visible aux autres.

Note technique : les sessions (film en cours, historique des films deja proposes) sont gardees
en memoire du process. Si le bot redemarre entre-temps, relance simplement `/film`.

## Limites connues

- Le scraping depend de la structure HTML actuelle de Letterboxd ; si le site change son
  markup, le scraping peut casser (a surveiller).
- La recherche TMDb prend le premier resultat correspondant au titre — pour des titres tres
  communs/ambigus, il peut arriver que ce ne soit pas exactement la bonne annee/version du film.
