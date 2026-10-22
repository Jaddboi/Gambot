// Shares match presentation helpers for result colors, hero selection, team labels, and player ordering.
const RESULT_COLORS = { win: 0x57c879, loss: 0xf08389, draw: 0x718bfc, abandoned: 0x718bfc };

function getResultColor(result) {
  return RESULT_COLORS[result] ?? 0x718bfc;
}

function getMostPlayedHero(player) {
  let selected = null;
  for (const hero of player.heroes) {
    if (!selected || (hero.play_time?.seconds ?? 0) > (selected.play_time?.seconds ?? 0)) {
      selected = hero;
    }
  }
  return selected;
}

function formatTeamTitle(team) {
  const outcome = team.result ? ` · ${team.result.toUpperCase()}` : "";
  const score = Number.isFinite(team.score) ? ` · Score ${team.score}` : "";
  return `${team.label}${outcome}${score}`;
}

function sortPlayersByKills(players) {
  return [...players].sort((a, b) => {
    const killsA = Number.isFinite(a.kills) && a.kills >= 0 ? a.kills : -1;
    const killsB = Number.isFinite(b.kills) && b.kills >= 0 ? b.kills : -1;
    return killsB - killsA;
  });
}

module.exports = { getResultColor, getMostPlayedHero, formatTeamTitle, sortPlayersByKills };
