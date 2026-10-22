// Labels career filters, win rates, and playtime consistently for overall and hero stats.
const { formatText } = require("./text");

function getSeasonLabel(filters, selectedSeason, allSeasons = false) {
  if (allSeasons && filters.season === null) return "All seasons";
  if (selectedSeason != null && selectedSeason.id === filters.season) {
    return `Season ${selectedSeason.number}`;
  }
  if (filters.season != null) return `Season ID: ${filters.season}`;
  return "API default season";
}

function getModeLabel(filters) {
  return { 1: "Quick Play", 2: "Competitive" }[filters.game_mode] ?? "API default mode";
}

function getWinRateLabel(career) {
  const hasMatches = Number.isFinite(career.matches) && career.matches >= 0;
  const hasWins = Number.isFinite(career.wins) && career.wins >= 0;
  if (!hasMatches || !hasWins || career.wins > career.matches) return "Unavailable";
  if (career.matches === 0) return "Unavailable (no matches)";
  return `${((career.wins / career.matches) * 100).toFixed(1)}%`;
}

function getPlaytimeLabel(playTime) {
  const formatted = formatText(playTime?.formatted);
  if (formatted !== "Unavailable") return formatted;
  const seconds = playTime?.seconds;
  if (!Number.isFinite(seconds) || seconds < 0) return "Unavailable";
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

module.exports = { getSeasonLabel, getModeLabel, getWinRateLabel, getPlaytimeLabel };
