// Combines career and proficiency pages and applies consistent page numbering.
const { buildCareerPages } = require("./build-career-pages");
const { buildPlayerProficiencyPages } = require("./build-player-proficiency-pages");

function buildPlayerStatsPages({
  player,
  result,
  proficiency = null,
  selectedSeason = null,
  allSeasons = false,
}) {
  const pages = [
    ...buildCareerPages({ player, result, selectedSeason, allSeasons }),
    ...buildPlayerProficiencyPages(player, proficiency),
  ];
  pages.forEach((embed, index) => embed.setFooter({
    text: `Page ${index + 1} / ${pages.length} • UID: ${player.uid} • Gambot cache: up to 3 minutes`,
  }));
  return pages;
}

module.exports = { buildPlayerStatsPages };
