// Tests stats page content and missing-data formatting without API calls.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildPlayerStatsPages } = require("../lib/embeds/stats/build-player-stats-pages");

const player = { uid: "123456789", name: "Dummy Player", account_level: 84 };
const fieldValue = (page, name) => page.fields.find(field => field.name === name).value;

test("stats pages expose overview, combat, impact, and proficiency availability", () => {
  const pages = buildPlayerStatsPages({
    player,
    result: {
      player: {
        ...player,
        rank: { rank: "Diamond I", peak_rank: "Grandmaster III", season: "Test Season", rank_score: 4200 },
      },
      career: {
        matches: 40, wins: 25, play_time: { formatted: "12h 30m", seconds: 45000 },
        kills: 550, deaths: 200, assists: 300, kd: 2.75, kda: 4.25,
        best_kill_streak: 18, final_hits: 300, headshot_kills: 40, solo_kills: 25,
        damage: 1250000, healing: 500000, damage_taken: 900000, mvp: 8, svp: 3,
        triple_kills: 12, quadruple_kills: 4, quintuple_kills: 2, sextuple_kills: 1,
      },
    },
  }).map(page => page.toJSON());

  assert.equal(pages.length, 4);
  for (const [index, name] of ["Overview", "Combat", "Impact"].entries()) {
    assert.equal(pages[index].title, `${player.name} — ${name}`);
    assert.match(pages[index].footer.text, new RegExp(`Page ${index + 1} / 4`));
    assert.equal(pages[index].fields.length, 9);
    assert.ok(pages[index].fields.every(field => typeof field.value === "string"));
  }
  assert.equal(fieldValue(pages[0], "Win rate"), "62.5%");
  assert.equal(fieldValue(pages[0], "Current rank"), "Diamond I");
  assert.equal(fieldValue(pages[0], "Rank season"), "Test Season");
  assert.equal(fieldValue(pages[0], "Playtime"), "12h 30m");
  assert.equal(fieldValue(pages[1], "K/D ratio"), "2.75");
  assert.equal(fieldValue(pages[1], "Assists"), "300");
  assert.equal(fieldValue(pages[2], "Damage dealt"), "1,250,000");
  assert.equal(fieldValue(pages[2], "Sextuple kills"), "1");
  assert.match(pages[3].description, /Premium-only/);
});

test("zero statistics remain zero and missing values are not called unranked or zero", () => {
  const pages = buildPlayerStatsPages({
    player,
    result: {
      player: { ...player, account_level: 0, rank: null },
      career: { matches: 0, wins: 0, kills: 0, kd: 0, healing: 0, play_time: { seconds: 0 } },
    },
  }).map(page => page.toJSON());

  assert.equal(fieldValue(pages[0], "Matches"), "0");
  assert.equal(fieldValue(pages[0], "Win rate"), "Unavailable (no matches)");
  assert.equal(fieldValue(pages[0], "Account level"), "0");
  assert.equal(fieldValue(pages[0], "Playtime"), "0h 0m");
  assert.equal(fieldValue(pages[0], "Current rank"), "Unavailable");
  assert.equal(fieldValue(pages[1], "Kills"), "0");
  assert.equal(fieldValue(pages[1], "K/D ratio"), "0.00");
  assert.equal(fieldValue(pages[1], "Deaths"), "Unavailable");
  assert.equal(fieldValue(pages[2], "Healing"), "0");
  assert.equal(fieldValue(pages[2], "Damage dealt"), "Unavailable");
});

test("win rate preserves a zero percent rate and rejects impossible totals", () => {
  for (const [matches, wins, expected] of [
    [10, 0, "0.0%"], [10, 10, "100.0%"], [10, 11, "Unavailable"],
    [10, null, "Unavailable"], [null, 1, "Unavailable"], [-1, 0, "Unavailable"],
  ]) {
    const [overview] = buildPlayerStatsPages({ player, result: { career: { matches, wins } } });
    assert.equal(fieldValue(overview.toJSON(), "Win rate"), expected);
  }
});

test("playtime falls back to seconds and API text stays within field limits", () => {
  const [overview] = buildPlayerStatsPages({
    player,
    result: {
      player: { ...player, rank: { rank: "A".repeat(2000) } },
      career: { play_time: { seconds: 3661 } },
    },
  });
  const data = overview.toJSON();
  assert.equal(fieldValue(data, "Playtime"), "1h 1m");
  assert.equal(fieldValue(data, "Current rank").length, 1024);
});
