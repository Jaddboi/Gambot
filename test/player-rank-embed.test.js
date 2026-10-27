// Tests rank presentation, missing values, legitimate zeros, and Discord text limits with dummy data.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildPlayerRankEmbed } = require("../lib/embeds/rank/build-player-rank-embed");

const player = { uid: "123456789", name: "Dummy Player" };

function buildEmbed(rank, name = player.name) {
  return buildPlayerRankEmbed({
    player: { ...player, name },
    rank,
  }).toJSON();
}

function fieldValue(embed, name) {
  return embed.fields.find((field) => field.name === name).value;
}

test("rank embed displays current and peak rank, score, and the returned rank season", () => {
  const embed = buildEmbed({
    rank: "Diamond I", peak_rank: "Grandmaster III", rank_score: 4200, season: "10.5",
  });
  assert.equal(embed.title, "Dummy Player — Rank");
  assert.equal(fieldValue(embed, "Current rank"), "Diamond I");
  assert.equal(fieldValue(embed, "Peak rank"), "Grandmaster III");
  assert.equal(fieldValue(embed, "Rank score"), "4,200");
  assert.equal(fieldValue(embed, "Rank season"), "10.5");
  // The thumbnail follows the current Diamond rank, not the Grandmaster peak.
  assert.equal(embed.thumbnail.url, "https://rivalsisland.com/static/ranks/rank_5.png");
  assert.ok(embed.footer.text.includes(`UID: ${player.uid}`));
  assert.match(embed.footer.text, /cache: up to 3 minutes/);
});

test("season cards label historical ranks and use confirmed catalog names when the API omits the name", () => {
  const embed = buildPlayerRankEmbed({
    player,
    rank: { rank: "Gold I", season: null, device_type: "pc" },
    selectedSeason: { id: 312, number: "9.5" },
  }).toJSON();
  assert.equal(fieldValue(embed, "Season rank"), "Gold I");
  assert.equal(fieldValue(embed, "Rank season"), "9.5");
  assert.equal(fieldValue(embed, "Platform"), "PC");
  assert.match(embed.description, /Season 9.5/);
  assert.match(embed.footer.text, /cache: up to 60 seconds/);
  assert.equal(embed.thumbnail.url, "https://rivalsisland.com/static/ranks/rank_3.png");
});

test("three platform rank cards fit Discord's combined 6000-character limit", () => {
  const embeds = ["pc", "ps", "xbox"].map((device_type) => buildPlayerRankEmbed({
    player: { ...player, name: "*".repeat(2000) },
    rank: { rank: "A".repeat(2000), peak_rank: "B".repeat(2000), season: "C".repeat(2000), device_type },
    selectedSeason: { id: 312, number: "9.5" },
  }).toJSON());
  const size = embeds.reduce((total, embed) => total + embed.title.length + embed.description.length +
    embed.footer.text.length + embed.fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0), 0);
  assert.ok(size <= 6000);
});

test("missing or invalid rank values are unavailable rather than assumed unranked or zero", () => {
  for (const rank of [undefined, null, {}, {
    rank: " ", peak_rank: null, rank_score: -1, season: "",
  }, { rank_score: "0" }]) {
    const embed = buildEmbed(rank);
    assert.equal(embed.fields.length, 4);
    assert.ok(embed.fields.every((field) => field.value === "Unavailable"));
    assert.equal(embed.thumbnail, undefined);
  }
});

test("a legitimate zero score and explicit unranked label remain visible", () => {
  const embed = buildEmbed({ rank: "Unranked", rank_score: 0, season: "0" });
  assert.equal(fieldValue(embed, "Current rank"), "Unranked");
  assert.equal(fieldValue(embed, "Rank score"), "0");
  assert.equal(fieldValue(embed, "Rank season"), "0");
  assert.equal(fieldValue(embed, "Peak rank"), "Unavailable");
  assert.equal(embed.thumbnail, undefined);
});

test("an unknown current rank does not borrow a badge from the known peak rank", () => {
  const embed = buildEmbed({ rank: "Unknown rank", peak_rank: "Diamond I", rank_level: 15 });
  assert.equal(fieldValue(embed, "Current rank"), "Unknown rank");
  assert.equal(embed.thumbnail, undefined);
});

test("rank presentation escapes player Markdown and bounds API text to embed limits", () => {
  const escaped = buildEmbed({}, "**Rank Player**");
  assert.equal(escaped.title, String.raw`\*\*Rank Player\*\* — Rank`);

  const embed = buildEmbed({
    rank: "A".repeat(2000), peak_rank: "B".repeat(2000), season: "C".repeat(2000),
  }, "*".repeat(2000));
  assert.ok(embed.title.length <= 256);
  for (const field of embed.fields) assert.ok(field.value.length <= 1024);
  const size = embed.title.length + embed.footer.text.length +
    embed.fields.reduce((total, field) => total + field.name.length + field.value.length, 0);
  assert.ok(size <= 6000);
});
