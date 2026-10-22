// Shares rank-name parsing for public badge URLs and compact scoreboard labels.
// Source: https://rivalsisland.com/data/game-data.json (ranks and their icon paths).
const rankTiers = new Map([
  ["bronze", { iconFile: "rank_1.png", label: "B" }],
  ["silver", { iconFile: "rank_2.png", label: "S" }],
  ["gold", { iconFile: "rank_3.png", label: "G" }],
  ["platinum", { iconFile: "rank_4.png", label: "P" }],
  ["diamond", { iconFile: "rank_5.png", label: "D" }],
  ["grandmaster", { iconFile: "rank_6.png", label: "GM" }],
  ["celestial", { iconFile: "rank_7.png", label: "C" }],
  ["eternity", { iconFile: "rank_8.png", label: "Eternity" }],
  ["one above all", { iconFile: "rank_9.png", label: "OAA" }],
]);

function parseRank(rankName) {
  if (typeof rankName !== "string") return null;

  const normalizedName = rankName.trim().toLowerCase().replace(/\s+/g, " ");
  // Divisions I/II/III and 1/2/3 share their tier's badge.
  const dividedRank = normalizedName.match(
    /^(bronze|silver|gold|platinum|diamond|grandmaster|celestial) (i{1,3}|[1-3])$/
  );
  const tierName = dividedRank ? dividedRank[1] : normalizedName;
  const tier = rankTiers.get(tierName);
  if (!tier) return null;
  const division = dividedRank?.[2];
  return { ...tier, division: { i: "1", ii: "2", iii: "3" }[division] ?? division };
}

function getRankIconUrl(rankName) {
  const rank = parseRank(rankName);
  return rank ? `https://rivalsisland.com/static/ranks/${rank.iconFile}` : null;
}

function formatShortRank(rankName) {
  if (typeof rankName !== "string") return "—";
  const rank = parseRank(rankName);
  if (rank?.division) return rank.label + rank.division;
  if (rank?.label === "Eternity" || rank?.label === "OAA") return rank.label;

  const name = rankName.trim() || "Unavailable";
  const characters = [...name];
  return characters.length > 9 ? characters.slice(0, 8).join("") + "…" : name;
}

module.exports = { getRankIconUrl, formatShortRank };
