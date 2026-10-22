// Builds one embed per returned match, including an empty-history page.
const { EmbedBuilder } = require("discord.js");
const { formatNumber, formatRankChange } = require("../../formatting/numbers");
const { formatMarkdownText } = require("../../formatting/text");

const formatText = (value) => formatMarkdownText(value, 200);

function buildPlayerHistoryPage(player, match, index, matchCount) {
  return new EmbedBuilder()
    .setColor(0x002a5c)
    .setTitle(`${formatText(player.name)} — Match History`)
    .setDescription(`Result: **${formatText(match.result)}**`)
    .addFields(
      {
        name: "Map",
        value: formatText(match.map?.name),
        inline: true,
      },
      {
        name: "Mode",
        value: formatText(match.game_mode),
        inline: true,
      },
      {
        name: "Rank change",
        value: formatRankChange(match.player?.rank?.change),
        inline: true,
      },
      {
        name: "Kills",
        value: formatNumber(match.player?.kills),
        inline: true,
      },
      {
        name: "Deaths",
        value: formatNumber(match.player?.deaths),
        inline: true,
      },
      {
        name: "Assists",
        value: formatNumber(match.player?.assists),
        inline: true,
      }
    )
    .setTimestamp(new Date(match.played_at))
    .setFooter({
      text: `Match ${index + 1} / ${matchCount} • UID: ${player.uid}`,
    });
}

function buildPlayerHistoryPages(player, history) {
  if (history.matches.length === 0) {
    return [new EmbedBuilder()
      .setColor(0x002a5c)
      .setTitle(`${formatText(player.name)} — Match History`)
      .setDescription("No matches were returned for this page.")];
  }
  return history.matches.map((match, index) =>
    buildPlayerHistoryPage(player, match, index, history.matches.length));
}

module.exports = { buildPlayerHistoryPage, buildPlayerHistoryPages };
