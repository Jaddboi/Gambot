// Builds hero career pages while preserving fractional match totals and missing data.
const { EmbedBuilder } = require("discord.js");
const { formatNumber, formatCount, formatRatio, formatAccuracy } = require("../../formatting/numbers");
const { formatMarkdownText } = require("../../formatting/text");
const { getSeasonLabel, getModeLabel, getWinRateLabel, getPlaytimeLabel } = require("../../formatting/career-stats");
const { getHeroIconUrl } = require("../../formatting/hero-icons");

function buildPlayerHeroPages({ result, hero, selectedSeason = null }) {
  const { career, player, filters } = result;
  const best = career.best ?? {};
  const title = `${formatMarkdownText(player.name, 70)} — ${formatMarkdownText(hero.name, 70)}`;
  const filterLabel = `${getSeasonLabel(filters, selectedSeason)} • ${getModeLabel(filters)}`;
  const iconUrl = getHeroIconUrl(hero);
  const field = (name, value) => ({ name, value, inline: true });
  const page = (label) => {
    const embed = new EmbedBuilder()
      .setColor(0x002a5c)
      .setTitle(`${title} — ${label}`)
      .setDescription(`Hero career stats • ${filterLabel}`);
    if (iconUrl) embed.setThumbnail(iconUrl);
    return embed;
  };

  const overview = page("Overview").addFields(
    // Hero switches can split a match between heroes; do not round these totals to whole matches.
    field("Matches", formatNumber(career.matches)),
    field("Wins", formatNumber(career.wins)),
    field("Win rate", getWinRateLabel(career)),
    field("Playtime", getPlaytimeLabel(career.play_time)),
    field("K/D ratio", formatRatio(career.kd)),
    field("KDA ratio", formatRatio(career.kda)),
    field("Kills", formatCount(career.kills)),
    field("Deaths", formatCount(career.deaths)),
    field("Assists", formatCount(career.assists))
  );

  let pages;
  if (career.matches === 0) {
    overview.setDescription(`Hero career stats • ${filterLabel}\nNo matches were reported for this hero and selection.`);
    pages = [overview];
  } else {
    const accuracy = formatAccuracy(career.accuracy);
    pages = [
      overview,
      page("Impact").addFields(
        field("Damage dealt", formatCount(career.damage)),
        field("Healing", formatCount(career.healing)),
        field("Damage taken", formatCount(career.damage_taken)),
        field("Accuracy", accuracy === "—" ? "Unavailable" : accuracy),
        field("MVP awards", formatCount(career.mvp)),
        field("SVP awards", formatCount(career.svp)),
        field("Triple kills", formatCount(career.triple_kills)),
        field("Quadruple kills", formatCount(career.quadruple_kills)),
        field("Quintuple kills", formatCount(career.quintuple_kills)),
        field("Sextuple kills", formatCount(career.sextuple_kills))
      ),
      page("Personal Bests").addFields(
        field("Best kills", formatCount(best.kills)),
        field("Best assists", formatCount(best.assists)),
        field("Best final hits", formatCount(best.final_hits)),
        field("Best headshot kills", formatCount(best.headshot_kills)),
        field("Best solo kills", formatCount(best.solo_kills)),
        field("Best damage", formatCount(best.damage)),
        field("Best healing", formatCount(best.healing))
      ),
    ];
  }

  pages.forEach((embed, index) => embed.setFooter({
    text: `Page ${index + 1} / ${pages.length} • UID: ${player.uid} • Gambot cache: up to 60 seconds • Hero matches/wins can be fractional`,
  }));
  return pages;
}

module.exports = { buildPlayerHeroPages };
