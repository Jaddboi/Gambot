// Builds named comparisons with full-width stat sections and neutral totals for context.
const { EmbedBuilder } = require("discord.js");
const { formatNumber } = require("../../formatting/numbers");
const { formatMarkdownText } = require("../../formatting/text");
const { getSeasonLabel, getModeLabel, getPlaytimeLabel } = require("../../formatting/career-stats");
const { getHeroIconUrl } = require("../../formatting/hero-icons");
const { buildComparisonField } = require("../../formatting/comparison");

function hasMatches(career) {
  return Number.isFinite(career.matches) && career.matches > 0;
}

function getStat(career, key) {
  const value = career[key];
  return hasMatches(career) && Number.isFinite(value) && value >= 0 ? value : null;
}

function perMatch(career, key) {
  const value = getStat(career, key);
  return value === null ? null : value / career.matches;
}

function perTenMinutes(career, key) {
  const value = getStat(career, key);
  const seconds = career.play_time?.seconds;
  return value !== null && Number.isFinite(seconds) && seconds > 0 ? value * 600 / seconds : null;
}

function winRate(career) {
  const wins = getStat(career, "wins");
  return wins !== null && wins <= career.matches ? wins * 100 / career.matches : null;
}

function accuracy(career) {
  const value = getStat(career, "accuracy");
  return value !== null && value <= 1 ? value * 100 : null;
}

function buildPlayerComparisonPages({ results, hero = null, selectedSeason = null }) {
  const careers = results.map((result) => result.career);
  const filters = results[0].filters;
  const playerNames = results.map((result) => result.player.name);
  const players = playerNames.map((name) => formatMarkdownText(name, 60));
  const title = `${players[0]} vs ${players[1]}`;
  const scope = hero ? `${formatMarkdownText(hero.name, 70)} career stats` : "Overall career stats";
  const modeLabel = filters.game_mode != null && ![1, 2].includes(filters.game_mode)
    ? `Mode ID: ${filters.game_mode}`
    : getModeLabel(filters);
  const platformLabel = { pc: "PC", ps: "PlayStation", xbox: "Xbox" }[filters.device_type] ?? "API default platform";
  const seasonLabel = formatMarkdownText(getSeasonLabel(filters, selectedSeason), 80);
  const filterLabel = `${seasonLabel} • ${modeLabel} • ${platformLabel}`;
  const iconUrl = getHeroIconUrl(hero);
  const page = (name) => {
    const embed = new EmbedBuilder()
      .setColor(0x002a5c)
      .setTitle(`${title} — ${name}`)
      .setDescription(`${scope}\n${filterLabel}`);
    if (iconUrl) embed.setThumbnail(iconUrl);
    return embed;
  };
  const metric = (name, getValue, options) => buildComparisonField(name, playerNames, careers.map(getValue), options);
  const percent = { precision: 1, suffix: "%", differenceSuffix: " percentage points" };

  const performance = page("Performance").addFields(
    metric("Win rate", winRate, percent),
    metric("K/D ratio", (career) => getStat(career, "kd")),
    metric("KDA ratio", (career) => getStat(career, "kda")),
    metric("Kills per match", (career) => perMatch(career, "kills")),
    metric("Deaths per match", (career) => perMatch(career, "deaths"), { lowerIsBetter: true }),
    metric("Assists per match", (career) => perMatch(career, "assists"))
  );
  const impact = page("Impact").addFields(
    metric("Damage per 10 minutes", (career) => perTenMinutes(career, "damage"), { precision: 0 }),
    metric("Healing per 10 minutes", (career) => perTenMinutes(career, "healing"), { precision: 0 }),
    metric("MVPs per match", (career) => perMatch(career, "mvp")),
    hero
      ? metric("Accuracy", accuracy, percent)
      : metric("Final hits per match", (career) => perMatch(career, "final_hits"))
  );

  const contextField = (name, formatValue) => ({
    name,
    value: careers.map((career, index) => `${players[index]}: ${formatValue(career)}`).join("\n"),
    inline: false,
  });
  const totals = page("Totals & Playtime")
    .setDescription(`${scope}\n${filterLabel}\nTotals reflect playtime and are not scored.`)
    .addFields(
      contextField("Matches", (career) => formatNumber(career.matches)),
      contextField("Wins", (career) => formatNumber(career.wins)),
      contextField("Playtime", (career) => formatMarkdownText(getPlaytimeLabel(career.play_time), 80)),
      contextField("Total kills / deaths / assists", (career) =>
        [career.kills, career.deaths, career.assists].map(formatNumber).join(" / ")),
      contextField("Damage dealt", (career) => formatNumber(career.damage)),
      contextField("Healing", (career) => formatNumber(career.healing)),
      contextField("Damage taken", (career) => formatNumber(career.damage_taken))
    );

  const pages = [performance, impact, totals];
  pages.forEach((embed, index) => embed.setFooter({
    text: `Page ${index + 1} / ${pages.length} • ${index === 2 ? "Totals are context" : "🟢 Bold = stronger value"} • Cache: up to 60 seconds`,
  }));
  return pages;
}

module.exports = { buildPlayerComparisonPages };
