// Tests all-time peak selection, historical coverage labels, missing data, and legitimate zeros.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildAllTimeRankEmbed } = require("../lib/embeds/rank/build-all-time-rank-embed");
const { findHighestRankPeak } = require("../lib/services/find-highest-rank-peak");

const player = { uid: "123456789", name: "**Dummy**" };
const gold = { season_id: 312, season: "9.5", device_type: "pc",
  peak_rank: "Gold I", peak_rank_level: 9, peak_rank_score: 9999 };
const diamond = { season_id: 307, season: "9", device_type: "ps",
  peak_rank: "Diamond I", peak_rank_level: 15, peak_rank_score: 4000 };

function fieldValue(embed, name) {
  return embed.fields.find((field) => field.name === name).value;
}

test("all-time compares peak levels before score and keeps all fields from the winning entry", () => {
  const seasons = [gold, diamond];
  const snapshot = structuredClone(seasons);
  const embed = buildAllTimeRankEmbed({ player, seasons }).toJSON();
  assert.equal(fieldValue(embed, "All-time peak rank"), "Diamond I");
  assert.equal(fieldValue(embed, "Peak score"), "4,000");
  assert.equal(fieldValue(embed, "Peak season"), "9");
  assert.equal(fieldValue(embed, "Platform"), "PS");
  assert.equal(embed.thumbnail.url, "https://rivalsisland.com/static/ranks/rank_5.png");
  assert.match(embed.description, /available seasons and platforms/);
  assert.match(embed.description, /coverage depends on the API/);
  assert.equal(embed.title, String.raw`\*\*Dummy\*\* — All-time Rank`);
  assert.deepEqual(seasons, snapshot);
});

test("equal peak levels use score as a tie-breaker and count distinct seasons across platforms", () => {
  const better = { ...diamond, device_type: "xbox", peak_rank_score: 4500 };
  const seasons = [gold, diamond, better];
  assert.equal(findHighestRankPeak(seasons), better);
  const embed = buildAllTimeRankEmbed({ player, seasons }).toJSON();
  assert.equal(fieldValue(embed, "Platform"), "XBOX");
  assert.equal(fieldValue(embed, "Seasons returned"), "2");
});

test("all-time does not substitute final ranks or invented zero values for missing peaks", () => {
  for (const seasons of [[], [{ ...gold, peak_rank: null }],
    [diamond, { ...gold, peak_rank_level: null }]]) {
    const embed = buildAllTimeRankEmbed({ player, seasons }).toJSON();
    assert.equal(fieldValue(embed, "All-time peak rank"), "Unavailable");
    assert.equal(fieldValue(embed, "Peak score"), "Unavailable");
    assert.equal(embed.thumbnail, undefined);
    assert.match(embed.description, /confirm an all-time rank/);
  }
});

test("a reported peak at level zero and score zero stays valid", () => {
  const embed = buildAllTimeRankEmbed({ player, seasons: [{
    ...gold, peak_rank: "Unranked", peak_rank_level: 0, peak_rank_score: 0, season: "0",
  }] }).toJSON();
  assert.equal(fieldValue(embed, "All-time peak rank"), "Unranked");
  assert.equal(fieldValue(embed, "Peak score"), "0");
  assert.equal(fieldValue(embed, "Peak season"), "0");
  assert.equal(embed.thumbnail, undefined);
});

test("all-time icons follow the selected peak rather than the season's final rank", () => {
  const embed = buildAllTimeRankEmbed({ player, seasons: [{ ...diamond, rank: "Bronze III" }] }).toJSON();
  assert.equal(fieldValue(embed, "All-time peak rank"), "Diamond I");
  assert.equal(embed.thumbnail.url, "https://rivalsisland.com/static/ranks/rank_5.png");
});
