// Builds hero proficiency pages, including honest unavailable and empty states.
const { EmbedBuilder, escapeMarkdown } = require("discord.js");

function buildPlayerProficiencyPages(player, proficiency) {
  const title = `${escapeMarkdown(player.name).slice(0, 100)} — Hero Proficiency`;
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
  const number = value => Number.isFinite(value) && value >= 0 ? value.toLocaleString("en-CA") : "Unavailable";
  for (let offset = 0; offset < heroes.length; offset += 9) {
    pages.push(page()
      .setDescription("Hero proficiency • Sorted by total proficiency points")
      .addFields(heroes.slice(offset, offset + 9).map(hero => ({
        name: escapeMarkdown(hero.name).slice(0, 100),
        value: [
          `Rank: ${typeof hero.proficiency.rank === "string" && hero.proficiency.rank.trim() !== ""
            ? escapeMarkdown(hero.proficiency.rank).slice(0, 100) : "Unavailable"}`,
          `Level: ${number(hero.proficiency.level)}`,
          `Points: ${number(hero.proficiency.points)}`,
          `To next level: ${number(hero.proficiency.points_to_next_level)}`,
        ].join("\n"),
        inline: true,
      })))
    );
  }
  return pages;
}

module.exports = { buildPlayerProficiencyPages };
