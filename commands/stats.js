// Finds a player and displays paginated career stats with owner-only navigation.
const { SlashCommandBuilder } = require("discord.js");
const {
  searchPlayerByUsername,
} = require("../lib/marvel-rivals-api/search-player-by-username");
const {
  getPlayerCareerStatsByUid,
} = require("../lib/marvel-rivals-api/get-player-career-stats");
const {
  buildPlayerStatsPages,
} = require("../lib/embeds/build-player-stats-pages");
const { paginateEmbeds } = require("../lib/paginate-embeds");
const {
  getPlayerProficiencyByUid,
} = require("../lib/marvel-rivals-api/get-player-proficiency");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Shows a player's Marvel Rivals stats")
    .addStringOption((option) =>
      option
        .setName("player")
        .setDescription("The player's Marvel Rivals username")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("season")
        .setDescription("The RivalsIsland season ID")
        .setRequired(false)
        .setMinValue(0)
    )
    .addIntegerOption((option) =>
      option
        .setName("mode")
        .setDescription("The game mode to show stats for")
        .setRequired(false)
        .addChoices(
          { name: "Quick Play", value: 1 },
          { name: "Competitive", value: 2 }
        )
    ),
  async execute(commandInteraction) {
    const username = commandInteraction.options.getString("player", true);
    const season = commandInteraction.options.getInteger("season");
    const mode = commandInteraction.options.getInteger("mode");

    await commandInteraction.deferReply();

    const apiKey = process.env.MARVEL_RIVALS_API_KEY;
    const baseUrl = process.env.MARVEL_RIVALS_API_BASE_URL;

    const player = await searchPlayerByUsername(username, apiKey, baseUrl);

    const result = await getPlayerCareerStatsByUid(
      player.uid,
      apiKey,
      baseUrl,
      { season, mode }
    );

    let proficiency = null;
    try {
      proficiency = await getPlayerProficiencyByUid(
        player.uid,
        apiKey,
        baseUrl
      );
    } catch {
      // Proficiency access is optional; keep the career pages usable if it is denied or unavailable.
    }
    const pages = buildPlayerStatsPages(player, result, proficiency);
    await paginateEmbeds(commandInteraction, pages);
  },
};
