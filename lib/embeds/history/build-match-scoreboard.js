// Builds the text-table fallback only when a scoreboard image cannot be rendered.
const { buildMatchOverview } = require("./build-match-overview");
const { buildTeamLeaderboard } = require("./build-team-leaderboard");
const { getScoreboardTeams } = require("./get-scoreboard-teams");

function buildMatchScoreboard(player, match, index, matchCount) {
  const overview = buildMatchOverview(player, match, index, matchCount);
  const { teams, totalTeams } = getScoreboardTeams(match, player.uid);
  const leaderboards = teams.map((team) => buildTeamLeaderboard(team, player.uid));
  if (totalTeams > 2) {
    overview.setFooter({ text: `${overview.data.footer.text} • Showing 2/${totalTeams} teams` });
  }
  return [overview, ...leaderboards];
}

module.exports = { buildMatchScoreboard };
