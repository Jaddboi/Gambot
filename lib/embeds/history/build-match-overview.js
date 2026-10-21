// Builds the existing match overview, including the selected player's hero thumbnail.
const { EmbedBuilder } = require("discord.js");
const { formatMarkdownText } = require("../../formatting/text");
const { formatMatchNumber, formatRankChange } = require("../../formatting/numbers");
const { getResultColor, getMostPlayedHero, getHeroIconUrl } = require("./match-formatting");

function buildMatchOverview(player, match, index, matchCount) {
  const participant = match.players.find((entry) => entry.uid === player.uid);
  if (!participant) throw new Error("The selected player is not in this match.");
  const hero = getMostPlayedHero(participant);
  const rankChange = formatRankChange(participant.rank?.change);
  const overview = new EmbedBuilder()
    .setColor(getResultColor(participant.result))
    .setTitle(`${formatMarkdownText(player.name, 40)} — Match History`)
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
    text: `Match ${index + 1} / ${matchCount} • UID: ${player.uid} • ➜ selected player • — unavailable`,
  });

  return overview;
}

module.exports = { buildMatchOverview };
