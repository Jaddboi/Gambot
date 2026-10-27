// Tests comparison directions, ties, rate calculations, missing data, and bounded embeds without API requests.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildComparisonField } = require("../lib/formatting/comparison");
const { buildPlayerComparisonPages } = require("../lib/embeds/compare/build-player-comparison-pages");
const heroFixture = require("./fixtures/hero-stats.json");
const playerNames = ["CampusPlayer", "OtherPlayer"];

function sampleResults() {
  const first = {
    player: { uid: "123456789", name: "CampusPlayer" },
    filters: { season: null, game_mode: null, device_type: null },
    career: {
      matches: 10, wins: 6, kills: 100, deaths: 20, assists: 40, kd: 5, kda: 7,
      damage: 10000, healing: 1000, damage_taken: 5000, mvp: 2, final_hits: 20,
      play_time: { seconds: 600, formatted: "10m" },
    },
  };
  const second = {
    player: { uid: "987654321", name: "OtherPlayer" },
    filters: { ...first.filters },
    career: {
      matches: 20, wins: 10, kills: 120, deaths: 50, assists: 40, kd: 2.4, kda: 3.2,
      damage: 20000, healing: 6000, damage_taken: 6000, mvp: 1, final_hits: 30,
      play_time: { seconds: 1800, formatted: "30m" },
    },
  };
  return [first, second];
}

function pagesFor(results = sampleResults(), options = {}) {
  return buildPlayerComparisonPages({ results, ...options }).map((page) => page.toJSON());
}

const field = (page, label) => page.fields.find((entry) => entry.name.startsWith(label));

test("comparison fields highlight either player, favor lower deaths, and label percentage-point differences", () => {
  const higher = buildComparisonField("Kills per match", playerNames, [5, 8]);
  assert.equal(higher.inline, false);
  assert.match(higher.value, /🟢 \*\*OtherPlayer: 8\.00\*\*/);
  assert.match(higher.value, /OtherPlayer leads by \*\*3\.00\*\*/);
  const lower = buildComparisonField("Deaths per match", playerNames, [5, 8], { lowerIsBetter: true });
  assert.equal(lower.name, "Deaths per match (lower is better)");
  assert.match(lower.value, /🟢 \*\*CampusPlayer: 5\.00\*\*/);
  assert.match(lower.value, /CampusPlayer leads by \*\*3\.00\*\*/);
  const percent = buildComparisonField("Win rate", playerNames, [60, 50], { precision: 1, suffix: "%", differenceSuffix: " percentage points" });
  assert.match(percent.value, /CampusPlayer: 60\.0%/);
  assert.match(percent.value, /CampusPlayer leads by \*\*10\.0 percentage points\*\*/);
});

test("ties use displayed precision and unknown values never award the other player a win", () => {
  for (const values of [[2.001, 2.004], [0, 0], [1.0001e13, 1.0002e13]]) {
    const comparison = buildComparisonField("Ratio", playerNames, values);
    assert.match(comparison.value, /Tie/);
    assert.doesNotMatch(comparison.value, /🟢|leads by/);
  }
  for (const value of [null, undefined, NaN, Infinity, -1, "5"]) {
    const comparison = buildComparisonField("Ratio", playerNames, [value, 5]);
    assert.match(comparison.value, /CampusPlayer: Unavailable/);
    assert.match(comparison.value, /Comparison unavailable/);
    assert.doesNotMatch(comparison.value, /🟢|Tie|leads by/);
  }
});

test("performance rates account for sample size and impact rates account for playtime", () => {
  const original = sampleResults();
  const before = structuredClone(original);
  const [performance, impact, totals] = pagesFor(original);
  assert.equal(performance.title, "CampusPlayer vs OtherPlayer — Performance");
  for (const page of [performance, impact, totals]) {
    assert.match(page.footer.text, /Cache: up to 3 minutes/);
    assert.ok(page.fields.every((entry) => entry.inline === false));
    assert.doesNotMatch(JSON.stringify(page), /\b[AB]:|\b[AB] ·|\b[AB] leads by/);
    for (const entry of page.fields) {
      assert.ok(entry.value.includes("CampusPlayer:"));
      assert.ok(entry.value.includes("OtherPlayer:"));
    }
  }
  assert.match(field(performance, "Win rate").value, /CampusPlayer: 60\.0%/);
  assert.match(field(performance, "Kills per match").value, /CampusPlayer: 10\.00/);
  assert.match(field(performance, "Deaths per match").value, /🟢 \*\*CampusPlayer: 2\.00\*\*/);
  assert.match(field(performance, "Deaths per match").value, /OtherPlayer: 2\.50/);
  assert.match(field(impact, "Damage per 10 minutes").value, /🟢 \*\*CampusPlayer: 10,000\*\*/);
  assert.match(field(impact, "Damage per 10 minutes").value, /OtherPlayer: 6,667/);
  assert.match(field(impact, "Healing per 10 minutes").value, /🟢 \*\*OtherPlayer: 2,000\*\*/);
  assert.match(field(impact, "MVPs per match").value, /CampusPlayer: 0\.20/);
  assert.match(field(impact, "Final hits per match").value, /CampusPlayer: 2\.00/);
  assert.match(totals.description, /not scored/);
  assert.match(field(totals, "Damage dealt").value, /CampusPlayer: 10,000\nOtherPlayer: 20,000/);
  assert.equal(field(totals, "Total kills / deaths / assists").value,
    "CampusPlayer: 100 / 20 / 40\nOtherPlayer: 120 / 50 / 40");
  for (const entry of totals.fields) assert.doesNotMatch(entry.value, /🟢|leads by|Tie/);
  assert.deepEqual(original, before);
});

test("zero or unknown match samples cannot win even when the API supplies ratios", () => {
  for (const matches of [0, null, undefined, -1]) {
    const results = sampleResults();
    results[0].career.matches = matches;
    results[0].career.kd = 100;
    const [performance, impact] = pagesFor(results);
    for (const entry of [...performance.fields, ...impact.fields]) {
      assert.match(entry.value, /CampusPlayer: Unavailable/);
      assert.match(entry.value, /Comparison unavailable/);
      assert.doesNotMatch(entry.value, /🟢|Tie|leads by/);
    }
  }
});

test("missing time and invalid totals do not invent rates or divide by zero", () => {
  for (const seconds of [0, null, -1, Infinity]) {
    const results = sampleResults();
    results[0].career.play_time.seconds = seconds;
    results[0].career.wins = 11;
    results[0].career.assists = -1;
    const [performance, impact] = pagesFor(results);
    assert.match(field(performance, "Win rate").value, /CampusPlayer: Unavailable/);
    assert.match(field(performance, "Assists per match").value, /CampusPlayer: Unavailable/);
    assert.match(field(impact, "Damage per 10 minutes").value, /CampusPlayer: Unavailable/);
    assert.match(field(impact, "Healing per 10 minutes").value, /CampusPlayer: Unavailable/);
    assert.match(field(performance, "K/D").value, /CampusPlayer: 5\.00/);
  }
});

test("hero comparisons retain fractional samples, show the icon, and compare accuracy", () => {
  const results = [structuredClone(heroFixture), structuredClone(heroFixture)];
  results[1].player = { uid: "987654321", name: "OtherPlayer" };
  results[1].career.matches = 25;
  results[1].career.wins = 16.5;
  results[1].career.accuracy = 0.5;
  results.forEach((result) => { result.filters = { season: 312, game_mode: 2, device_type: "pc" }; });
  const pages = pagesFor(results, { hero: heroFixture.hero, selectedSeason: { id: 312, number: "9.5" } });
  assert.match(field(pages[0], "Win rate").value, /Tie/);
  assert.match(field(pages[1], "Accuracy").value, /🟢 \*\*OtherPlayer: 50\.0%\*\*/);
  assert.match(field(pages[1], "Accuracy").value, /7\.5 percentage points/);
  assert.equal(field(pages[1], "Final hits"), undefined);
  assert.equal(field(pages[2], "Matches").value, "CampusPlayer: 12.5\nOtherPlayer: 25");
  for (const page of pages) {
    assert.equal(page.thumbnail.url, heroFixture.hero.icon);
    assert.match(page.description, /SPIDER-MAN career stats\nSeason 9\.5 • Competitive • PC/);
  }
});

test("comparison text and extreme numeric values stay within Discord embed limits", () => {
  const results = sampleResults();
  for (const result of results) {
    result.player.name = "**name**\n".repeat(100);
    result.career.play_time.formatted = "**time**\n".repeat(1000);
    result.career.kd = result.player.uid === "123456789" ? 1e308 : 1e300;
    result.career.damage = 1e308;
    result.filters.season = 312;
  }
  const pages = pagesFor(results, { selectedSeason: { id: 312, number: "9".repeat(10000) } });
  for (const [index, page] of pages.entries()) {
    assert.ok(page.title.length <= 256);
    assert.ok(page.description.length <= 4096);
    assert.ok(page.title.includes("\\*\\*name\\*\\*"));
    assert.ok(page.footer.text.startsWith(`Page ${index + 1} / 3`));
    assert.ok(page.fields.length <= 25);
    let length = page.title.length + page.description.length + page.footer.text.length;
    for (const entry of page.fields) {
      assert.ok(entry.name.length > 0 && entry.name.length <= 256);
      assert.ok(entry.value.length > 0 && entry.value.length <= 1024);
      length += entry.name.length + entry.value.length;
    }
    assert.ok(length <= 6000);
  }
});
