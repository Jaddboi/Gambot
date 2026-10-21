// Builds hero proficiency pages, including honest unavailable and empty states.
const { EmbedBuilder } = require("discord.js");
const { formatNumber } = require("../../formatting/numbers");
const { formatMarkdownText } = require("../../formatting/text");

const HEROES_PER_PAGE = 9;

function buildHeroField(hero) {
  return {
    name: formatMarkdownText(hero.name),
    value: [
      `Rank: ${formatMarkdownText(hero.proficiency.rank)}`,
      `Level: ${formatNumber(hero.proficiency.level)}`,
      `Points: ${formatNumber(hero.proficiency.points)}`,
      `To next level: ${formatNumber(hero.proficiency.points_to_next_level)}`,
    ].join("\n"),
    inline: true,
  };
}

function buildPlayerProficiencyPages(player, proficiency) {
  const title = `${formatMarkdownText(player.name)} — Hero Proficiency`;
  const page = () => new EmbedBuilder().setColor(0x002a5c).setTitle(title);
  if (proficiency == null) {
    return [page().setDescription(
      "Hero proficiency data could not be loaded. RivalsIsland lists this endpoint as Premium-only. " +
      "Check your API plan and the player's profile availability, or try again later."
    )];
  }
  if (proficiency.heroes.length === 0) {
    return [page().setDescription("The API returned no hero proficiency records for this player.")];
  }

  const heroes = [...proficiency.heroes].sort((a, b) => b.proficiency.points - a.proficiency.points);
  const pages = [];
  for (let offset = 0; offset < heroes.length; offset += HEROES_PER_PAGE) {
    const pageHeroes = heroes.slice(offset, offset + HEROES_PER_PAGE);
    const fields = pageHeroes.map(buildHeroField);
    pages.push(page()
      .setDescription("Hero proficiency • Sorted by total proficiency points")
      .addFields(fields));
  }
  return pages;
}

module.exports = { buildPlayerProficiencyPages };
