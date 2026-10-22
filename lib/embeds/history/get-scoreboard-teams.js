// Selects at most two scoreboard groups, putting the searched player's team first.
function getScoreboardTeams(match, selectedUid) {
  if (match.teams.length === 0) {
    return { teams: [{ label: "Participants", players: match.players }], totalTeams: 1 };
  }

  const groups = new Map(match.teams.map((team) => [team.id, {
    ...team, label: `Team ${team.id}`, players: [],
  }]));
  for (const player of match.players) {
    if (!groups.has(player.team_id)) {
      groups.set(player.team_id, { label: `Team ${player.team_id}`, players: [] });
    }
    groups.get(player.team_id).players.push(player);
  }

  const outcomeOrder = { win: 0, draw: 1, loss: 2, abandoned: 3 };
  const teams = [...groups.values()].filter((team) => team.players.length > 0);
  teams.sort((a, b) => {
    const aIsSelected = a.players.some((player) => player.uid === selectedUid);
    const bIsSelected = b.players.some((player) => player.uid === selectedUid);
    if (aIsSelected !== bIsSelected) return aIsSelected ? -1 : 1;
    return (outcomeOrder[a.result] ?? 4) - (outcomeOrder[b.result] ?? 4);
  });
  return { teams: teams.slice(0, 2), totalTeams: teams.length };
}

module.exports = { getScoreboardTeams };
