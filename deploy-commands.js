require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('film')
    .setDescription('Choisis un film dans la watchlist Letterboxd et poste ses infos')
    .addStringOption((option) =>
      option
        .setName('titre')
        .setDescription('Cherche un film dans ta watchlist')
        .setRequired(true)
        .setAutocomplete(true),
    )
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Enregistrement de la commande /film...');

    // Enregistrement au niveau du serveur (GUILD_ID) : instantane, ideal pour un usage perso.
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands },
    );

    console.log('Commande /film enregistree avec succes sur le serveur.');
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement de la commande :', error);
  }
})();
