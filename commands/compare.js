// Compares two players with shared filters and highlights stronger performance values.
const { SlashCommandBuilder } = require("discord.js");
const { resolveSeason } = require("../lib/services/resolve-season");
const { resolveHero } = require("../lib/services/resolve-hero");
const { getPlayerComparison } = require("../lib/services/get-player-comparison");
const { buildPlayerComparisonPages } = require("../lib/embeds/compare/build-player-comparison-pages");
const { paginateEmbeds } = require("../lib/discord/paginate-embeds");
const { formatMarkdownText } = require("../lib/formatting/text");
const { retryRateLimitedRequest } = require("../lib/services/retry-rate-limited-request");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("compare")
    .setDescription("Compares two players and highlights their stronger stats")
    .addStringOption((option) => option
      .setName("player-a")
      .setDescription("The first player's Marvel Rivals username")
      .setRequired(true))
    .addStringOption((option) => option
      .setName("player-b")
      .setDescription("The second player's Marvel Rivals username")
      .setRequired(true))
    .addStringOption((option) => option
      .setName("hero")
      .setDescription("Compare one hero instead of overall stats")
      .setRequired(false)
      .setMinLength(1)
      .setMaxLength(100))
    .addNumberOption((option) => option
      .setName("season")
      .setDescription("The season number, such as 9 or 9.5")
      .setRequired(false)
      .setMinValue(0))
    .addIntegerOption((option) => option
      .setName("mode")
      .setDescription("The game mode for both players")
      .setRequired(false)
      .addChoices({ name: "Quick Play", value: 1 }, { name: "Competitive", value: 2 })),

  async execute(commandInteraction) {
    await commandInteraction.deferReply();
    const playerA = commandInteraction.options.getString("player-a", true);
    const playerB = commandInteraction.options.getString("player-b", true);
    const heroName = commandInteraction.options.getString("hero");
    const season = commandInteraction.options.getNumber("season");
    const mode = commandInteraction.options.getInteger("mode");

    if (playerA.trim().toLowerCase() === playerB.trim().toLowerCase()) {
      await commandInteraction.editReply("Choose two different players to compare.");
      return;
    }

    const apiKey = process.env.MARVEL_RIVALS_API_KEY;
    const baseUrl = process.env.MARVEL_RIVALS_API_BASE_URL;
    const selectedSeason = await retryRateLimitedRequest(() => resolveSeason(season, apiKey, baseUrl));
    if (season != null && !selectedSeason) {
      await commandInteraction.editReply("That season is unavailable. Please choose an existing season.");
      return;
    }

    let hero = null;
    if (heroName !== null) {
      const selection = await retryRateLimitedRequest(() => resolveHero(heroName, apiKey, baseUrl));
      if (!selection.hero) {
        const suggestions = selection.suggestions.map((entry) => formatMarkdownText(entry.name)).join(", ");
        await commandInteraction.editReply({
          content: "No unique hero matched that name. " + (suggestions
            ? `Try a full name: ${suggestions}.`
            : "Use the hero's full name, such as Spider-Man or Iron Man."),
          allowedMentions: { parse: [] },
        });
        return;
      }
      hero = selection.hero;
    }

    const comparison = await getPlayerComparison([playerA, playerB], apiKey, baseUrl, {
      hero,
      season: selectedSeason?.id ?? null,
      mode,
    });
    if (comparison.message) {
      await commandInteraction.editReply({
        content: comparison.message,
        allowedMentions: { parse: [] },
      });
      return;
    }
    const pages = buildPlayerComparisonPages({ results: comparison.results, hero, selectedSeason });
    await paginateEmbeds(commandInteraction, pages);
  },
};
