// Builds a match overview for history navigation or a standalone lookup, with the selected hero thumbnail.
const { EmbedBuilder } = require("discord.js");
const { formatMarkdownText } = require("../../formatting/text");
const { formatMatchNumber, formatRankChange } = require("../../formatting/numbers");
const { getResultColor, getMostPlayedHero, getHeroIconUrl } = require("./match-formatting");

function buildMatchOverview(player, match, index = null, matchCount = null) {
  const participant = match.players.find((entry) => entry.uid === player.uid);
  if (!participant) throw new Error("The selected player is not in this match.");
  const hero = getMostPlayedHero(participant);
  const rankChange = formatRankChange(participant.rank?.change);
  const isHistoryEntry = index != null && matchCount != null;
  const title = isHistoryEntry ? "Match History" : "Match Details";
  const position = isHistoryEntry ? `Match ${index + 1} / ${matchCount} • ` : "";
  const overview = new EmbedBuilder()
    .setColor(getResultColor(participant.result))
    .setTitle(`${formatMarkdownText(player.name, 40)} — ${title}`)
    .setDescription([
      `Result: **${participant.result}** · Rank change: **${rankChange}**`,
      `**${formatMarkdownText(match.category?.name, 40)}** · Hero: **${formatMarkdownText(hero?.name, 40)}**`,
      `Match ID: \`${match.match_uid}\``,
    ].join("\n"))
    .addFields(
      { name: "Map", value: formatMarkdownText(match.map?.name, 40), inline: true },
      { name: "Mode", value: formatMarkdownText(match.game_mode, 40), inline: true },
      { name: "Duration", value: formatMarkdownText(match.duration?.formatted, 40), inline: true },
      { name: "Kills", value: formatMatchNumber(participant.kills), inline: true },
      { name: "Deaths", value: formatMatchNumber(participant.deaths), inline: true },
      { name: "Assists", value: formatMatchNumber(participant.assists), inline: true }
    )
    .setTimestamp(new Date(match.played_at));
  const iconUrl = getHeroIconUrl(hero);
  if (iconUrl) overview.setThumbnail(iconUrl);

  overview.setFooter({
    text: `${position}UID: ${player.uid} • Gold highlight / >: selected player • — unavailable`,
  });

  return overview;
}

module.exports = { buildMatchOverview };
