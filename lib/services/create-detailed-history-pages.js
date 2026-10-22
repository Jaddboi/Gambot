// Loads only the selected match and memoizes its overview, scoreboard images, and attachments.
const { getMatchDetailsByUid } = require("../marvel-rivals-api/get-match-details");
const { buildPlayerHistoryPage, buildPlayerHistoryPages } = require("../embeds/history/build-player-history-pages");
const { createMatchScoreboardMessage } = require("./create-match-scoreboard-message");

function createDetailedHistoryPages(player, history, apiKey, baseUrl) {
  if (history.matches.length === 0) return buildPlayerHistoryPages(player, history);

  return history.matches.map((match, index) => {
    let completedPage = null;

    return async function loadMatchPage() {
      if (completedPage) return completedPage;

      let failureStage = "match details";
      try {
        const details = await getMatchDetailsByUid(match.match_uid, apiKey, baseUrl);
        failureStage = "scoreboard formatting";
        completedPage = await createMatchScoreboardMessage(player, details, index, history.matches.length);
        return completedPage;
      } catch {
        console.error(`History fallback: failed during ${failureStage}.`);
        const fallback = buildPlayerHistoryPage(player, match, index, history.matches.length);
        fallback.setDescription(`${fallback.data.description}\n\nFull scoreboard unavailable. Showing the match summary.`);
        // Failures are not memoized, so revisiting a page can retry after an API wait.
        return { embeds: [fallback.toJSON()], files: [], attachments: [] };
      }
    };
  });
}

module.exports = { createDetailedHistoryPages };
