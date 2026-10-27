// Defines /hero info and displays catalog identity, lore, and a trusted character thumbnail.
const { SlashCommandBuilder } = require("discord.js");
const { resolveHero } = require("../lib/services/resolve-hero");
const { retryRateLimitedRequest } = require("../lib/services/retry-rate-limited-request");
const { getHeroDetailsById } = require("../lib/marvel-rivals-api/get-hero-details");
const { buildHeroInfoPages } = require("../lib/embeds/heroes/build-hero-info-pages");
const { paginateEmbeds } = require("../lib/discord/paginate-embeds");
const { formatMarkdownText } = require("../lib/formatting/text");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("hero")
    .setDescription("Looks up Marvel Rivals hero information")
    .addSubcommand((subcommand) => subcommand
      .setName("info")
      .setDescription("Shows a hero's role, identity, story, and team-ups")
      .addStringOption((option) => option
        .setName("name")
        .setDescription("The hero's full name, such as Spider-Man")
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(100))),

  async execute(commandInteraction) {
    await commandInteraction.deferReply();
    const heroName = commandInteraction.options.getString("name", true);
    const apiKey = process.env.MARVEL_RIVALS_API_KEY;
    const baseUrl = process.env.MARVEL_RIVALS_API_BASE_URL;
    const selection = await retryRateLimitedRequest(() => resolveHero(heroName, apiKey, baseUrl));
    if (!selection.hero) {
      const names = selection.suggestions.map((hero) => formatMarkdownText(hero.name)).join(", ");
      await commandInteraction.editReply({
        content: "No unique hero matched that name. " + (names
          ? `Try a full name: ${names}.`
          : "Use the hero's full name, such as Spider-Man or Iron Man."),
        allowedMentions: { parse: [] },
      });
      return;
    }

    let hero;
    try {
      hero = await retryRateLimitedRequest(() => getHeroDetailsById(selection.hero.id, apiKey, baseUrl));
    } catch (error) {
      if (error.status !== 404) throw error;
      await commandInteraction.editReply("Details for this hero are unavailable right now. Please try again later.");
      return;
    }
    await paginateEmbeds(commandInteraction, buildHeroInfoPages(hero, selection.hero));
  },
};
