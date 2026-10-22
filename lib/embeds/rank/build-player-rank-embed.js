// Builds a rank card from profile metadata or a specific rank-history entry.
const { EmbedBuilder } = require("discord.js");
const { formatNumber } = require("../../formatting/numbers");
const { formatText, formatMarkdownText } = require("../../formatting/text");
const { getRankIconUrl } = require("../../formatting/ranks");

function buildPlayerRankEmbed({ player, rank, selectedSeason = null }) {
  const description = selectedSeason
    ? `Season ${formatMarkdownText(selectedSeason.number)} • Competitive`
    : "Latest rank reported by the API.";
  const embed = new EmbedBuilder()
    .setColor(0x002a5c)
    .setTitle(`${formatMarkdownText(player.name)} — Rank`)
    .setDescription(description)
    .addFields(
      {
        name: selectedSeason ? "Season rank" : "Current rank",
        value: formatText(rank?.rank, 128),
        inline: true,
      },
      {
        name: "Peak rank",
        value: formatText(rank?.peak_rank, 128),
        inline: true,
      },
      {
        name: "Rank score",
        value: formatNumber(rank?.rank_score),
        inline: true,
      },
      {
        name: "Rank season",
        value: formatText(rank?.season ?? selectedSeason?.number, 128),
        inline: true,
      }
    )
    .setFooter({
      text: `UID: ${player.uid} • Gambot cache: up to 60 seconds`,
    });

  const rankIconUrl = getRankIconUrl(rank?.rank);
  if (rankIconUrl) embed.setThumbnail(rankIconUrl);

  if (rank?.device_type) {
    embed.addFields({
      name: "Platform",
      value: formatText(rank.device_type.toUpperCase()),
      inline: true,
    });
  }
  return embed;
}

module.exports = { buildPlayerRankEmbed };
