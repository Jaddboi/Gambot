// Resolves a hero and player, then displays their filtered hero career stats with pagination.
const { SlashCommandBuilder } = require("discord.js");
const { resolveHero } = require("../lib/services/resolve-hero");
const { resolveSeason } = require("../lib/services/resolve-season");
const { searchPlayerByUsername } = require("../lib/marvel-rivals-api/search-player-by-username");
const { getPlayerHeroStatsByUid } = require("../lib/marvel-rivals-api/get-player-hero-stats");
const { buildPlayerHeroPages } = require("../lib/embeds/heroes/build-player-hero-pages");
const { paginateEmbeds } = require("../lib/discord/paginate-embeds");
const { formatMarkdownText } = require("../lib/formatting/text");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("hero-stats")
    .setDescription("Shows a player's career stats for one hero")
    .addStringOption((option) => option
      .setName("hero")
      .setDescription("The hero's full name, such as Spider-Man")
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(100))
    .addStringOption((option) => option
      .setName("player")
      .setDescription("The player's Marvel Rivals username")
      .setRequired(true))
    .addNumberOption((option) => option
      .setName("season")
      .setDescription("The season number, such as 9 or 9.5")
      .setRequired(false)
      .setMinValue(0))
    .addIntegerOption((option) => option
      .setName("mode")
      .setDescription("The game mode to show stats for")
      .setRequired(false)
      .addChoices({ name: "Quick Play", value: 1 }, { name: "Competitive", value: 2 })),

  async execute(commandInteraction) {
    const heroName = commandInteraction.options.getString("hero", true);
    const username = commandInteraction.options.getString("player", true);
    const season = commandInteraction.options.getNumber("season");
    const mode = commandInteraction.options.getInteger("mode");
    await commandInteraction.deferReply();

    const apiKey = process.env.MARVEL_RIVALS_API_KEY;
    const baseUrl = process.env.MARVEL_RIVALS_API_BASE_URL;
    const { hero, suggestions } = await resolveHero(heroName, apiKey, baseUrl);
    if (!hero) {
      const suggestionText = suggestions.length > 0
        ? ` Try a full name: ${suggestions.map((entry) => formatMarkdownText(entry.name)).join(", ")}.`
        : " Use the hero's full name, such as Spider-Man or Iron Man.";
      await commandInteraction.editReply({
        content: `No unique hero matched that name.${suggestionText}`,
        allowedMentions: { parse: [] },
      });
      return;
    }

    const selectedSeason = await resolveSeason(season, apiKey, baseUrl);
    if (season != null && !selectedSeason) {
      await commandInteraction.editReply("That season is unavailable. Please choose an existing season.");
      return;
    }

    let player;
    try {
      player = await searchPlayerByUsername(username, apiKey, baseUrl);
    } catch (error) {
      if (error.message !== "Player not found." && error.status !== 404) throw error;
      await commandInteraction.editReply("No player was found with that username.");
      return;
    }

    let result;
    try {
      result = await getPlayerHeroStatsByUid(player.uid, hero.id, apiKey, baseUrl, {
        season: selectedSeason?.id ?? null,
        mode,
      });
    } catch (error) {
      if (error.status !== 404) throw error;
      await commandInteraction.editReply("Hero stats are unavailable for this player and selection.");
      return;
    }

    const pages = buildPlayerHeroPages({ result, hero, selectedSeason });
    await paginateEmbeds(commandInteraction, pages);
  },
};
