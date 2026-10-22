// Shows the highest comparable peak across the seasons and platforms returned by the API.
const { EmbedBuilder } = require("discord.js");
const { findHighestRankPeak } = require("../../services/find-highest-rank-peak");
const { formatNumber } = require("../../formatting/numbers");
const { formatText, formatMarkdownText } = require("../../formatting/text");
const { getRankIconUrl } = require("./get-rank-icon-url");

function buildAllTimeRankEmbed({ player, seasons }) {
  const peak = findHighestRankPeak(seasons);
  const seasonCount = new Set(seasons.map((season) => season.season_id)).size;
  let description = "Highest reported peak across available seasons and platforms. Historical coverage depends on the API.";
  if (!peak) {
    description += "\nThe API did not provide enough comparable peak data to confirm an all-time rank.";
  }

  const embed = new EmbedBuilder()
    .setColor(0x002a5c)
    .setTitle(`${formatMarkdownText(player.name)} — All-time Rank`)
    .setDescription(description)
    .addFields(
      { name: "All-time peak rank", value: formatText(peak?.peak_rank), inline: true },
      { name: "Peak score", value: formatNumber(peak?.peak_rank_score), inline: true },
      { name: "Peak season", value: formatText(peak?.season), inline: true },
      { name: "Platform", value: formatText(peak?.device_type?.toUpperCase()), inline: true },
      { name: "Seasons returned", value: formatNumber(seasonCount), inline: true }
    )
    .setFooter({ text: `UID: ${player.uid} • Gambot cache: up to 60 seconds` });

  const rankIconUrl = getRankIconUrl(peak?.peak_rank);
  if (rankIconUrl) embed.setThumbnail(rankIconUrl);
  return embed;
}

module.exports = { buildAllTimeRankEmbed };
