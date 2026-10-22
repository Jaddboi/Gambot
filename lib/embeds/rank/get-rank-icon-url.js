// Maps known rank names to the provider's public badge images without making an API request.
// Source: https://rivalsisland.com/data/game-data.json (ranks and their icon paths).
const rankIcons = new Map([
  ["bronze", "rank_1.png"],
  ["silver", "rank_2.png"],
  ["gold", "rank_3.png"],
  ["platinum", "rank_4.png"],
  ["diamond", "rank_5.png"],
  ["grandmaster", "rank_6.png"],
  ["celestial", "rank_7.png"],
  ["eternity", "rank_8.png"],
  ["one above all", "rank_9.png"],
]);

function getRankIconUrl(rankName) {
  if (typeof rankName !== "string") return null;

  const normalizedName = rankName.trim().toLowerCase().replace(/\s+/g, " ");
  // Divisions I/II/III and 1/2/3 share their tier's badge.
  const dividedRank = normalizedName.match(
    /^(bronze|silver|gold|platinum|diamond|grandmaster|celestial) (?:i{1,3}|[1-3])$/
  );
  const tierName = dividedRank ? dividedRank[1] : normalizedName;
  const iconFile = rankIcons.get(tierName);
  if (!iconFile) return null;

  return `https://rivalsisland.com/static/ranks/${iconFile}`;
}

module.exports = { getRankIconUrl };
