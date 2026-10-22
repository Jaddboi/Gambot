// Tests verified badge mappings, supported rank-name formats, and safe handling of unknown values.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getRankIconUrl } = require("../lib/embeds/rank/get-rank-icon-url");

test("each known rank tier maps to its provider badge", () => {
  const tiers = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Grandmaster", "Celestial", "Eternity", "One Above All"];
  for (const [index, tier] of tiers.entries()) {
    assert.equal(getRankIconUrl(tier), `https://rivalsisland.com/static/ranks/rank_${index + 1}.png`);
  }
});

test("numeric and Roman divisions share a tier badge despite case and extra spaces", () => {
  for (const division of ["I", "II", "III", "1", "2", "3"]) {
    assert.equal(getRankIconUrl(`  gRaNdMaStEr   ${division}  `), "https://rivalsisland.com/static/ranks/rank_6.png");
  }
  assert.equal(getRankIconUrl(" ONE   ABOVE ALL "), "https://rivalsisland.com/static/ranks/rank_9.png");
});

test("missing, unranked, unknown, and URL-like values never select an unrelated badge", () => {
  for (const rank of [null, undefined, 0, 15, {}, "", " ", "Unranked", "Unknown", "Diamond IV", "Eternity I",
    "Grandmaster 0", "Grandmaster 23", "constructor", "https://untrusted.example/icon.png", "../rank_1.png"]) {
    assert.equal(getRankIconUrl(rank), null);
  }
});
