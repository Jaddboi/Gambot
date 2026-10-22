// Shows the latest profile rank, a selected season's ranks, or the highest available all-time peak.
const { SlashCommandBuilder } = require("discord.js");
const { resolveSeason } = require("../lib/services/resolve-season");
const {
  searchPlayerByUsername,
} = require("../lib/marvel-rivals-api/search-player-by-username");
const {
  getPlayerCareerStatsByUid,
} = require("../lib/marvel-rivals-api/get-player-career-stats");
const {
  buildPlayerRankEmbed,
} = require("../lib/embeds/rank/build-player-rank-embed");
const {
  getPlayerRankHistoryByUid,
} = require("../lib/marvel-rivals-api/get-player-rank-history");
const {
  buildAllTimeRankEmbed,
} = require("../lib/embeds/rank/build-all-time-rank-embed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Shows a player's Marvel Rivals rank")
    .addStringOption((option) =>
      option
        .setName("player")
        .setDescription("The player's Marvel Rivals username")
        .setRequired(true)
    )
    .addNumberOption((option) =>
      option
        .setName("season")
        .setDescription("The season number, such as 9 or 9.5 (API Premium)")
        .setMinValue(0)
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("all-time")
        .setDescription("Show the highest reported peak across available seasons (API Premium)")
        .setRequired(false)
    ),

  async execute(commandInteraction) {
    const username = commandInteraction.options.getString("player", true);
    const season = commandInteraction.options.getNumber("season");
    const allTime = commandInteraction.options.getBoolean("all-time") ?? false;

    await commandInteraction.deferReply();

    if (allTime && season != null) {
      await commandInteraction.editReply("Choose either a season or all-time, not both.");
      return;
    }

    const apiKey = process.env.MARVEL_RIVALS_API_KEY;
    const baseUrl = process.env.MARVEL_RIVALS_API_BASE_URL;

    const selectedSeason = await resolveSeason(season, apiKey, baseUrl);

    if (season != null && !selectedSeason) {
      await commandInteraction.editReply(
        "That season is unavailable. Please choose an existing season."
      );
      return;
    }

    const player = await searchPlayerByUsername(username, apiKey, baseUrl);

    let embeds;
    if (allTime || selectedSeason) {
      let history;
      try {
        history = await getPlayerRankHistoryByUid(
          player.uid, apiKey, baseUrl, selectedSeason?.id ?? null
        );
      } catch (error) {
        if (error.status !== 403) throw error;

        await commandInteraction.editReply(
          "Seasonal and all-time ranks require API Premium access."
        );
        return;
      }
      if (history.seasons.length === 0) {
        await commandInteraction.editReply("No rank history is available for this player and selection.");
        return;
      }

      if (allTime) {
        embeds = [buildAllTimeRankEmbed({ player, seasons: history.seasons })];
      } else {
        // A season may have separate PC, PlayStation, and Xbox ranks.
        embeds = history.seasons.map((rank) => buildPlayerRankEmbed({ player, rank, selectedSeason }));
      }
    } else {
      const result = await getPlayerCareerStatsByUid(player.uid, apiKey, baseUrl);
      embeds = [buildPlayerRankEmbed({ player: result.player, rank: result.player.rank })];
    }

    await commandInteraction.editReply({
      embeds,
      allowedMentions: { parse: [] },
    });
  },
};
