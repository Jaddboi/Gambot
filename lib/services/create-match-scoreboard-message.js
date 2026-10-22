// Combines the overview with one image containing both teams, falling back to text tables if rendering fails.
const { EmbedBuilder } = require("discord.js");
const { buildMatchScoreboard } = require("../embeds/history/build-match-scoreboard");
const { buildMatchOverview } = require("../embeds/history/build-match-overview");
const { getScoreboardTeams } = require("../embeds/history/get-scoreboard-teams");
const { loadScoreboardImages } = require("../rendering/history/load-scoreboard-images");
const { renderMatchScoreboard } = require("../rendering/history/render-match-scoreboard");

async function createMatchScoreboardMessage(player, match, index, matchCount) {
  const overview = buildMatchOverview(player, match, index, matchCount);
  const { teams, totalTeams } = getScoreboardTeams(match, player.uid);
  if (totalTeams > 2) {
    overview.setFooter({ text: `${overview.data.footer.text} • Showing 2/${totalTeams} teams` });
  }
  try {
    const images = await loadScoreboardImages(teams.flatMap((team) => team.players));
    const file = {
      attachment: await renderMatchScoreboard(teams, player.uid, images),
      name: `history-${index}-scoreboard.png`,
      description: "Match scoreboard: both teams, player, rank, K/D/A, final hits, damage, damage taken, healing, accuracy.",
    };
    const scoreboard = new EmbedBuilder()
      .setColor(0x002a5c)
      .setTitle("Match scoreboard")
      .setImage(`attachment://${file.name}`)
      .setFooter({ text: "Open image for full size • Sorted by kills • Rank shown after match • TAKEN: damage taken" });
    const cards = [overview, scoreboard];

    return { embeds: cards.map((card) => card.toJSON()), files: [file], attachments: [] };
  } catch {
    console.error("History fallback: failed during image rendering.");
    const textCards = buildMatchScoreboard(player, match, index, matchCount);
    return { embeds: textCards.map((card) => card.toJSON()), files: [], attachments: [] };
  }
}

module.exports = { createMatchScoreboardMessage };
