// Builds one embed per returned match, including an empty-history page.
const { EmbedBuilder } = require("discord.js");
const { formatNumber, formatRankChange } = require("../../formatting/numbers");
const { formatMarkdownText } = require("../../formatting/text");

const formatText = (value) => formatMarkdownText(value, 200);

function buildPlayerHistoryPages(player, history) {
  const playerName = formatText(player.name);
  const matches = history.matches;

  if (matches.length === 0) {
    const emptyPage = new EmbedBuilder()
      .setColor(0x002a5c)
      .setTitle(`${playerName} — Match History`)
      .setDescription("No matches were returned for this page.");

    return [emptyPage];
  }

  const pages = [];

  for (const match of matches) {
    const pageNumber = pages.length + 1;

    const page = new EmbedBuilder()
      .setColor(0x002a5c)
      .setTitle(`${playerName} — Match History`)
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
        text: `Match ${pageNumber} / ${matches.length} • UID: ${player.uid}`,
      });

    pages.push(page);
  }

  return pages;
}

module.exports = { buildPlayerHistoryPages };
