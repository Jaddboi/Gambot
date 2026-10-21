// Builds overview, combat, and impact embeds from an existing player stats response.
const { EmbedBuilder, escapeMarkdown } = require("discord.js");
const { buildPlayerProficiencyPages } = require("./build-player-proficiency-pages");

function buildPlayerStatsPages(player, result, proficiency = null) {
  const career = result.career;
  const profile = result.player ?? player;
  const rank = profile.rank;
  const name = escapeMarkdown(profile.name ?? player.name).slice(0, 100);
  const number = (value) => Number.isFinite(value) && value >= 0
    ? value.toLocaleString("en-CA", { maximumFractionDigits: 0 })
    : "Unavailable";
  const ratio = (value) => Number.isFinite(value) && value >= 0
    ? value.toFixed(2)
    : "Unavailable";
  const text = (value) => typeof value === "string" && value.trim() !== ""
    ? value.trim().slice(0, 1024)
    : "Unavailable";
  const field = (label, value) => ({ name: label, value, inline: true });

  let winRate = "Unavailable";
  if (
    Number.isFinite(career.matches) && career.matches >= 0 &&
    Number.isFinite(career.wins) && career.wins >= 0 && career.wins <= career.matches
  ) {
    winRate = career.matches === 0
      ? "Unavailable (no matches)"
      : `${((career.wins / career.matches) * 100).toFixed(1)}%`;
  }

  let playtime = text(career.play_time?.formatted);
  const seconds = career.play_time?.seconds;
  if (playtime === "Unavailable" && Number.isFinite(seconds) && seconds >= 0) {
    playtime = `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  }

  const page = (title) => new EmbedBuilder()
    .setColor(0x002a5c)
    .setTitle(`${name} — ${title}`)
    .setDescription("Career stats • API default filters");

  const pages = [
    page("Overview").addFields(
      field("Matches", number(career.matches)),
      field("Wins", number(career.wins)),
      field("Win rate", winRate),
      field("Playtime", playtime),
      field("Account level", number(profile.account_level ?? player.account_level)),
      field("Rank score", number(rank?.rank_score)),
      field("Current rank", text(rank?.rank)),
      field("Peak rank", text(rank?.peak_rank)),
      field("Rank season", text(rank?.season))
    ),
    page("Combat").addFields(
      field("Kills", number(career.kills)),
      field("Deaths", number(career.deaths)),
      field("Assists", number(career.assists)),
      field("K/D ratio", ratio(career.kd)),
      field("KDA ratio", ratio(career.kda)),
      field("Best kill streak", number(career.best_kill_streak)),
      field("Final hits", number(career.final_hits)),
      field("Headshot kills", number(career.headshot_kills)),
      field("Solo kills", number(career.solo_kills))
    ),
    page("Impact").addFields(
      field("Damage dealt", number(career.damage)),
      field("Healing", number(career.healing)),
      field("Damage taken", number(career.damage_taken)),
      field("MVP awards", number(career.mvp)),
      field("SVP awards", number(career.svp)),
      field("Triple kills", number(career.triple_kills)),
      field("Quadruple kills", number(career.quadruple_kills)),
      field("Quintuple kills", number(career.quintuple_kills)),
      field("Sextuple kills", number(career.sextuple_kills))
    ),
  ];
  pages.push(...buildPlayerProficiencyPages(player, proficiency));
  pages.forEach((embed, index) => embed.setFooter({
    text: `Page ${index + 1} / ${pages.length} • UID: ${player.uid} • Gambot cache: up to 60 seconds`,
  }));
  return pages;
}

module.exports = { buildPlayerStatsPages };
