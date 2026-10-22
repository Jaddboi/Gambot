// Tests shared rank parsing for verified badges, compact labels, and unknown values.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getRankIconUrl, formatShortRank } = require("../lib/formatting/ranks");

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

test("compact rank labels use the same Roman and numeric division parsing as badge selection", () => {
  const ranks = [["Bronze", "B"], ["Silver", "S"], ["Gold", "G"], ["Platinum", "P"],
    ["Diamond", "D"], ["Grandmaster", "GM"], ["Celestial", "C"]];
  for (const [tier, prefix] of ranks) {
    for (const [roman, number] of [["I", "1"], ["II", "2"], ["III", "3"]]) {
      assert.equal(formatShortRank(`${tier} ${roman}`), prefix + number);
      assert.equal(formatShortRank(`${tier} ${number}`), prefix + number);
      assert.equal(getRankIconUrl(`${tier} ${roman}`), getRankIconUrl(`${tier} ${number}`));
    }
  }
  assert.equal(formatShortRank("Eternity"), "Eternity");
  assert.equal(formatShortRank("One Above All"), "OAA");
  assert.equal(formatShortRank(null), "—");
  assert.equal(formatShortRank("Future unknown rank"), "Future u…");
});
