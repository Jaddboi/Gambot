// Loads only the selected match and builds a native embed, with summary fallbacks.
const { EmbedBuilder } = require("discord.js");
const { getMatchDetailsByUid } = require("../marvel-rivals-api/get-match-details");
const { buildPlayerHistoryPages } = require("../embeds/build-player-history-pages");
const { buildMatchScoreboard } = require("./build-match-scoreboard");

function createDetailedHistoryPages(player, history, apiKey, baseUrl) {
  const summaries = buildPlayerHistoryPages(player, history);
  if (history.matches.length === 0) return summaries;

  return history.matches.map((match, index) => {
    let completedPage = null;

    return async function loadMatchPage() {
      if (completedPage) return completedPage;

      try {
        const details = await getMatchDetailsByUid(match.match_uid, apiKey, baseUrl);
        const embeds = buildMatchScoreboard(player, details, index, history.matches.length);

        completedPage = {
          embeds: embeds.map((embed) => embed.toJSON()),
          files: [],
          attachments: [],
        };
        return completedPage;
      } catch {
        const fallback = EmbedBuilder.from(summaries[index])
          .setDescription(`${summaries[index].data.description}\n\nFull scoreboard unavailable. Showing the match summary.`);
        // Failures are not memoized, so revisiting a page can retry after an API wait.
        return { embeds: [fallback.toJSON()], files: [], attachments: [] };
      }
    };
  });
}

module.exports = { createDetailedHistoryPages };
