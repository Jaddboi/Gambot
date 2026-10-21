// Looks up a player and displays their recent match history.
const { SlashCommandBuilder } = require("discord.js");
const {
  searchPlayerByUsername,
} = require("../lib/marvel-rivals-api/search-player-by-username");
const {
  getPlayerMatchHistoryByUid,
} = require("../lib/marvel-rivals-api/get-player-match-history");
const {
  createDetailedHistoryPages,
} = require("../lib/services/create-detailed-history-pages");
const { paginateEmbeds } = require("../lib/discord/paginate-embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("history")
    .setDescription("Shows a player's recent Marvel Rivals matches")
    .addStringOption((option) =>
      option
        .setName("player")
        .setDescription("The player's Marvel Rivals username")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("mode")
        .setDescription("The game mode to show matches for")
        .setRequired(false)
        .addChoices(
          { name: "Quick Play", value: 1 },
          { name: "Competitive", value: 2 }
        )
    ),

  async execute(commandInteraction) {
    const username = commandInteraction.options.getString("player", true);
    const mode = commandInteraction.options.getInteger("mode");

    await commandInteraction.deferReply();

    const apiKey = process.env.MARVEL_RIVALS_API_KEY;
    const baseUrl = process.env.MARVEL_RIVALS_API_BASE_URL;

    const player = await searchPlayerByUsername(username, apiKey, baseUrl);

    const history = await getPlayerMatchHistoryByUid(
      player.uid,
      apiKey,
      baseUrl,
      { mode }
    );

    const pages = createDetailedHistoryPages(player, history, apiKey, baseUrl);

    await paginateEmbeds(commandInteraction, pages);
  },
};
