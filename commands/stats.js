// Finds a player and displays paginated career stats with owner-only navigation.
const { SlashCommandBuilder } = require("discord.js");
const {
  searchPlayerByUsername,
} = require("../lib/marvel-rivals-api/search-player-by-username");
const {
  getPlayerCareerStatsByUid,
} = require("../lib/marvel-rivals-api/get-player-career-stats");
const { buildPlayerStatsPages } = require("../lib/embeds/build-player-stats-pages");
const { paginateEmbeds } = require("../lib/paginate-embeds");
const { getPlayerProficiencyByUid } = require("../lib/marvel-rivals-api/get-player-proficiency");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Shows a player's Marvel Rivals stats")
    .addStringOption((option) =>
      option
        .setName("player")
        .setDescription("The player's Marvel Rivals username")
        .setRequired(true)
    ),
  async execute(commandInteraction) {
    const username = commandInteraction.options.getString("player", true);

    await commandInteraction.deferReply();

    const apiKey = process.env.MARVEL_RIVALS_API_KEY;
    const baseUrl = process.env.MARVEL_RIVALS_API_BASE_URL;

    const player = await searchPlayerByUsername(username, apiKey, baseUrl);

    const result = await getPlayerCareerStatsByUid(player.uid, apiKey, baseUrl);

    let proficiency = null;
    try {
      proficiency = await getPlayerProficiencyByUid(player.uid, apiKey, baseUrl);
    } catch {
      // Proficiency access is optional; keep the career pages usable if it is denied or unavailable.
    }
    const pages = buildPlayerStatsPages(player, result, proficiency);
    await paginateEmbeds(commandInteraction, pages);
  },
};
