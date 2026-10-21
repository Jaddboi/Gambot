// Builds the overview, combat, and impact career embeds without API calls or interaction handling.
const { EmbedBuilder } = require("discord.js");
const { formatCount, formatRatio } = require("../../formatting/numbers");
const { formatText, formatMarkdownText } = require("../../formatting/text");

function getSeasonLabel(filters, selectedSeason, allSeasons) {
  if (allSeasons && filters.season === null) return "All seasons";
  if (selectedSeason != null && selectedSeason.id === filters.season) {
    return `Season ${selectedSeason.number}`;
  }
  if (filters.season != null) return `Season ID: ${filters.season}`;
  return "API default season";
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

function buildCareerPages({ player, result, selectedSeason = null, allSeasons = false }) {
  const career = result.career;
  const profile = result.player ?? player;
  const rank = profile.rank;
  const name = formatMarkdownText(profile.name ?? player.name);
  const field = (label, value) => ({ name: label, value, inline: true });

  const winRate = getWinRateLabel(career);
  const playtime = getPlaytimeLabel(career.play_time);

  const filters = result.filters ?? {};

  const seasonLabel = getSeasonLabel(filters, selectedSeason, allSeasons);

  const modeLabel =
    {
      1: "Quick Play",
      2: "Competitive",
    }[filters.game_mode] ?? "API default mode";

  const page = (title) =>
    new EmbedBuilder()
      .setColor(0x002a5c)
      .setTitle(`${name} — ${title}`)
      .setDescription(`Career stats • ${seasonLabel} • ${modeLabel}`);

  const pages = [
    page("Overview").addFields(
      field("Matches", formatCount(career.matches)),
      field("Wins", formatCount(career.wins)),
      field("Win rate", winRate),
      field("Playtime", playtime),
      field(
        "Account level",
        formatCount(profile.account_level ?? player.account_level)
      ),
      field("Rank score", formatCount(rank?.rank_score)),
      field("Current rank", formatText(rank?.rank)),
      field("Peak rank", formatText(rank?.peak_rank)),
      field("Rank season", formatText(rank?.season))
    ),
    page("Combat").addFields(
      field("Kills", formatCount(career.kills)),
      field("Deaths", formatCount(career.deaths)),
      field("Assists", formatCount(career.assists)),
      field("K/D ratio", formatRatio(career.kd)),
      field("KDA ratio", formatRatio(career.kda)),
      field("Best kill streak", formatCount(career.best_kill_streak)),
      field("Final hits", formatCount(career.final_hits)),
      field("Headshot kills", formatCount(career.headshot_kills)),
      field("Solo kills", formatCount(career.solo_kills))
    ),
    page("Impact").addFields(
      field("Damage dealt", formatCount(career.damage)),
      field("Healing", formatCount(career.healing)),
      field("Damage taken", formatCount(career.damage_taken)),
      field("MVP awards", formatCount(career.mvp)),
      field("SVP awards", formatCount(career.svp)),
      field("Triple kills", formatCount(career.triple_kills)),
      field("Quadruple kills", formatCount(career.quadruple_kills)),
      field("Quintuple kills", formatCount(career.quintuple_kills)),
      field("Sextuple kills", formatCount(career.sextuple_kills))
    ),
  ];
  return pages;
}

module.exports = { buildCareerPages };
