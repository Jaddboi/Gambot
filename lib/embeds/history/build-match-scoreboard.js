// Assembles the overview and two team leaderboards without fetching data or managing interactions.
const { buildMatchOverview } = require("./build-match-overview");
const { buildTeamLeaderboard } = require("./build-team-leaderboard");

function teamGroups(match) {
  if (match.teams.length === 0) return [{ label: "Participants", players: match.players }];
  const teams = new Map(match.teams.map((team) => [team.id, { ...team, label: `Team ${team.id}`, players: [] }]));
  for (const player of match.players) {
    if (!teams.has(player.team_id)) {
      teams.set(player.team_id, { label: `Team ${player.team_id}`, players: [] });
    }
    teams.get(player.team_id).players.push(player);
  }
  const order = { win: 0, draw: 1, loss: 2, abandoned: 3 };
  return [...teams.values()].filter((team) => team.players.length > 0)
    .sort((a, b) => (order[a.result] ?? 4) - (order[b.result] ?? 4));
}

function buildMatchScoreboard(player, match, index, matchCount) {
  const overview = buildMatchOverview(player, match, index, matchCount);
  const groups = teamGroups(match);
  const teams = groups.slice(0, 2);
  const selectedTeam = groups.find((team) => team.players.some((entry) => entry.uid === player.uid));
  if (selectedTeam && !teams.includes(selectedTeam)) teams[teams.length - 1] = selectedTeam;
  const leaderboards = teams.map((team) => buildTeamLeaderboard(team, player.uid));
  if (groups.length > 2) {
    overview.setFooter({ text: `${overview.data.footer.text} • Showing 2/${groups.length} teams` });
  }
  return [overview, ...leaderboards];
}

module.exports = { buildMatchScoreboard };
