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
const { getSeasons } = require("../lib/marvel-rivals-api/get-seasons");

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
    .addNumberOption((option) =>
      option
        .setName("season")
        .setDescription("The season number, such as 9 or 9.5")
        .setRequired(false)
        .setMinValue(0)
    )
    .addBooleanOption((option) =>
      option
        .setName("all-seasons")
        .setDescription("Show career stats across all seasons; omit the season option")
        .setRequired(false)
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
    const season = commandInteraction.options.getNumber("season");
    const allSeasons = commandInteraction.options.getBoolean("all-seasons") ?? false;
    const mode = commandInteraction.options.getInteger("mode");

    await commandInteraction.deferReply();

    if (allSeasons && season != null) {
      await commandInteraction.editReply(
        "Choose either a specific season or all-seasons:true."
      );
      return;
    }

    const apiKey = process.env.MARVEL_RIVALS_API_KEY;
    const baseUrl = process.env.MARVEL_RIVALS_API_BASE_URL;

    let seasonId = null;
    let selectedSeason = null;

    if (season != null) {
      const seasons = await getSeasons(apiKey, baseUrl);

      selectedSeason = seasons.find((entry) => Number(entry.number) === season);

      if (!selectedSeason) {
        await commandInteraction.editReply(
          "That season is unavailable. Please choose an existing season."
        );
        return;
      }

      seasonId = selectedSeason.id;
    }

    const player = await searchPlayerByUsername(username, apiKey, baseUrl);

    const result = await getPlayerCareerStatsByUid(
      player.uid,
      apiKey,
      baseUrl,
      { season: seasonId, mode }
    );

    if (allSeasons && result.filters.season !== null) {
      await commandInteraction.editReply(
        "The stats service did not confirm an all-seasons result. Please try again later."
      );
      return;
    }

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
    const pages = buildPlayerStatsPages(
      player,
      result,
      proficiency,
      selectedSeason,
      allSeasons
    );
    await paginateEmbeds(commandInteraction, pages);
  },
};
