require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const axios = require('axios');
const cheerio = require('cheerio');

const {
  DISCORD_TOKEN,
  LETTERBOXD_USERNAME,
  TMDB_API_KEY,
} = process.env;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Sessions en memoire : userId -> { pick, totalCount }
const sessions = new Map();

// Cache de la watchlist en memoire pour ne pas re-scraper a chaque frappe
// pendant l'autocomplete. Se rafraichit automatiquement au bout de CACHE_TTL_MS.
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
let watchlistCache = { films: [], fetchedAt: 0 };

// ---- Scraping de la watchlist Letterboxd (publique, pas besoin d'API) ----
async function fetchWatchlist(username) {
  const films = [];
  let page = 1;

  while (true) {
    const url = `https://letterboxd.com/${username}/watchlist/page/${page}/`;
    let html;

    try {
      const res = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LetterboxdDiscordBot/1.0)' },
      });
      html = res.data;
    } catch (err) {
      // 404 sur les pages au-dela de la derniere page = on arrete simplement la boucle
      break;
    }

    const $ = cheerio.load(html);
    const posters = $('[data-target-link][data-item-full-display-name]');

    if (posters.length === 0) break;

    posters.each((_, el) => {
      const slug = $(el).attr('data-target-link'); // ex: /film/jaws/
      const title = $(el).attr('data-item-full-display-name'); // ex: "Jaws (1975)"
      if (title && slug) {
        films.push({ title, slug });
      }
    });

    page += 1;
    if (page > 60) break; // garde-fou, une watchlist ne devrait jamais depasser ~1700 films
  }

  return films;
}

// ---- Renvoie la watchlist en cache, en la rafraichissant si trop vieille ----
async function getCachedWatchlist() {
  const isStale = Date.now() - watchlistCache.fetchedAt > CACHE_TTL_MS;

  if (isStale || watchlistCache.films.length === 0) {
    const films = await fetchWatchlist(LETTERBOXD_USERNAME);
    if (films.length > 0) {
      watchlistCache = { films, fetchedAt: Date.now() };
    }
  }

  return watchlistCache.films;
}

// ---- Extrait "Titre (Annee)" en { title, year } ----
function parseTitleAndYear(fullTitle) {
  const match = fullTitle.match(/^(.*)\s\((\d{4})\)$/);
  if (match) {
    return { title: match[1].trim(), year: match[2] };
  }
  return { title: fullTitle.trim(), year: null };
}

// ---- Recherche des infos du film sur TMDb (synopsis, note, affiche) ----
async function getTmdbInfo(fullTitle) {
  const { title, year } = parseTitleAndYear(fullTitle);

  const res = await axios.get('https://api.themoviedb.org/3/search/movie', {
    params: {
      api_key: TMDB_API_KEY,
      query: title,
      language: 'fr-FR',
      ...(year ? { year } : {}),
    },
  });

  return res.data.results?.[0] || null;
}

// ---- Construit l'embed a partir d'un film choisi ----
async function buildFilmEmbed(pick, totalCount) {
  const info = await getTmdbInfo(pick.title);
  const letterboxdUrl = `https://letterboxd.com${pick.slug}`;

  const embed = new EmbedBuilder()
    .setColor(0xff8000)
    .setTitle('On regarde ca ce soir ?')
    .setURL(letterboxdUrl);

  if (info) {
    const year = info.release_date ? info.release_date.slice(0, 4) : '?';
    embed
      .setDescription(`**${info.title} (${year})**`)
      .addFields(
        { name: 'Note TMDb', value: info.vote_average ? `${info.vote_average.toFixed(1)} / 10` : 'N/A', inline: true },
      )
      .addFields({ name: 'Synopsis', value: info.overview || 'Pas de synopsis disponible.' });

    if (info.poster_path) {
      embed.setThumbnail(`https://image.tmdb.org/t/p/w500${info.poster_path}`);
    }
  } else {
    embed.setDescription(`**${pick.title}**\n\nAucune info TMDb trouvee pour ce titre.`);
  }

  embed.setFooter({ text: `Choisi parmi ${totalCount} films de la watchlist` });

  return { embed, info };
}

// ---- Bouton Poster ----
function buildButtons(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('film_post')
      .setLabel('Poster')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
  );
}

client.once('ready', () => {
  console.log(`Bot connecte en tant que ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  // ---- Autocomplete pendant que l'utilisateur tape le titre ----
  if (interaction.isAutocomplete()) {
    const focusedValue = interaction.options.getFocused().toLowerCase();

    try {
      const films = await getCachedWatchlist();

      const matches = films
        .filter((f) => f.title.toLowerCase().includes(focusedValue))
        .slice(0, 25)
        .map((f) => ({ name: f.title, value: f.slug }));

      await interaction.respond(matches);
    } catch (err) {
      console.error(err);
      await interaction.respond([]);
    }
    return;
  }

  // ---- Commande /film ----
  if (interaction.isChatInputCommand() && interaction.commandName === 'film') {
    await interaction.deferReply({ ephemeral: true });

    try {
      const films = await getCachedWatchlist();

      if (films.length === 0) {
        await interaction.editReply(
          "Je n'ai trouve aucun film dans la watchlist. Verifie que le pseudo Letterboxd est correct et que le profil est public.",
        );
        return;
      }

      const selectedSlug = interaction.options.getString('titre');
      let pick = films.find((f) => f.slug === selectedSlug);

      // Si l'utilisateur a valide sans choisir une suggestion, on retente une
      // correspondance approximative sur le texte tape.
      if (!pick) {
        const typed = selectedSlug.toLowerCase();
        pick = films.find((f) => f.title.toLowerCase().includes(typed));
      }

      if (!pick) {
        await interaction.editReply(
          "Je n'ai pas trouve ce film dans la watchlist. Retape /film et choisis un titre dans les suggestions proposees.",
        );
        return;
      }

      const { embed } = await buildFilmEmbed(pick, films.length);

      sessions.set(interaction.user.id, { pick, totalCount: films.length });

      await interaction.editReply({ embeds: [embed], components: [buildButtons()] });
    } catch (err) {
      console.error(err);
      await interaction.editReply(
        "Une erreur est survenue en recuperant le film. Reessaie dans un instant.",
      );
    }
    return;
  }

  // ---- Bouton Poster ----
  if (interaction.isButton() && interaction.customId === 'film_post') {
    const session = sessions.get(interaction.user.id);

    if (!session) {
      await interaction.reply({
        content: "Cette session a expire, relance /film pour en choisir un nouveau.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferUpdate();

    try {
      const { embed } = await buildFilmEmbed(session.pick, session.totalCount);
      embed.setTitle('On regarde ca ce soir !');

      // Message public dans le channel
      await interaction.channel.send({ embeds: [embed] });

      // On confirme dans le message ephemere et on desactive le bouton
      await interaction.editReply({
        content: 'Poste dans le channel !',
        embeds: [embed],
        components: [buildButtons(true)],
      });

      sessions.delete(interaction.user.id);
    } catch (err) {
      console.error(err);
      await interaction.followUp({
        content: "Erreur en postant le film, reessaie.",
        ephemeral: true,
      });
    }
  }
});

client.login(DISCORD_TOKEN);
