// Tests hero-stat page values, empty states, thumbnails, and embed limits without API calls.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildPlayerHeroPages } = require("../lib/embeds/heroes/build-player-hero-pages");
const fixture = require("./fixtures/hero-stats.json");

const buildPages = (result = fixture, hero = fixture.hero, selectedSeason = null) =>
  buildPlayerHeroPages({ result, hero, selectedSeason }).map((page) => page.toJSON());
const value = (page, name) => page.fields.find((field) => field.name === name).value;

test("hero pages show fractional totals, combat, impact, and distinct personal bests", () => {
  const before = structuredClone(fixture);
  const pages = buildPages();
  assert.equal(pages.length, 3);
  assert.equal(value(pages[0], "Matches"), "12.5");
  assert.equal(value(pages[0], "Wins"), "8.25");
  assert.equal(value(pages[0], "Win rate"), "66.0%");
  assert.equal(value(pages[0], "Playtime"), "2h 6m");
  assert.equal(value(pages[0], "K/D ratio"), "5.00");
  assert.equal(value(pages[0], "KDA ratio"), "7.00");
  assert.equal(value(pages[0], "Kills"), "100");
  assert.equal(value(pages[1], "Damage dealt"), "100,500");
  assert.equal(value(pages[1], "Healing"), "0");
  assert.equal(value(pages[1], "Accuracy"), "43%");
  assert.equal(value(pages[1], "Sextuple kills"), "0");
  assert.equal(value(pages[2], "Best kills"), "30");
  assert.equal(value(pages[2], "Best final hits"), "18");
  assert.equal(value(pages[2], "Best damage"), "25,100");
  assert.deepEqual(fixture, before);
});

test("hero pages label returned filters rather than assuming the requested season", () => {
  for (const [season, selectedSeason, label] of [
    [312, { id: 312, number: "9.5" }, "Season 9.5"],
    [307, { id: 312, number: "9.5" }, "Season ID: 307"],
    [null, null, "API default season"],
  ]) {
    const pages = buildPages({ ...fixture, filters: { season, game_mode: 2 } }, fixture.hero, selectedSeason);
    for (const [index, page] of pages.entries()) {
      assert.equal(page.description, `Hero career stats • ${label} • Competitive`);
      assert.ok(page.footer.text.startsWith(`Page ${index + 1} / 3 • UID: ${fixture.player.uid}`));
      assert.match(page.footer.text, /Hero matches\/wins can be fractional/);
      assert.match(page.footer.text, /cache: up to 3 minutes/);
    }
  }
});

test("missing and invalid stats stay unavailable while real zero counts stay zero", () => {
  const [overview, impact, best] = buildPages({
    ...fixture,
    career: { kills: 0, deaths: -1, assists: "4", kd: null, kda: -1, accuracy: 2, healing: 0, best: {} },
  });
  for (const name of ["Matches", "Wins", "Deaths", "Assists", "K/D ratio", "KDA ratio", "Playtime", "Win rate"]) {
    assert.equal(value(overview, name), "Unavailable");
  }
  assert.equal(value(overview, "Kills"), "0");
  assert.equal(value(impact, "Accuracy"), "Unavailable");
  assert.equal(value(impact, "Healing"), "0");
  assert.equal(value(best, "Best kills"), "Unavailable");
  assert.doesNotMatch(overview.description, /No matches were reported/);
});

test("hero win rate handles impossible totals and zero matches without dividing by zero", () => {
  for (const [matches, wins, label] of [[10, 11, "Unavailable"], [0, 0, "Unavailable (no matches)"], [0.5, 0, "0.0%"]]) {
    const pages = buildPages({ ...fixture, career: { matches, wins } });
    assert.equal(value(pages[0], "Win rate"), label);
    assert.equal(pages.length, matches === 0 ? 1 : 3);
  }
  const [overview] = buildPages({ ...fixture, career: { matches: 1, play_time: { seconds: 3661 } } });
  assert.equal(value(overview, "Playtime"), "1h 1m");
});

test("native thumbnails use the trusted catalog icon and never allow foreign or credentialed URLs", () => {
  for (const icon of [null, "not-a-url", "https://evil.example/hero.png", "http://assets.rivalsisland.com/hero.png",
    "https://key@assets.rivalsisland.com/hero.png", "https://assets.rivalsisland.com.evil.example/hero.png"]) {
    assert.ok(buildPages(fixture, { ...fixture.hero, icon }).every((page) => !page.thumbnail));
  }
  assert.ok(buildPages().every((page) => page.thumbnail.url === fixture.hero.icon));
});

test("external text is escaped and bounded so all hero pages fit Discord embed limits", () => {
  const result = structuredClone(fixture);
  result.player.name = "**name**\n".repeat(100);
  result.career.play_time.formatted = "x".repeat(5000);
  const hero = { ...fixture.hero, name: "__hero__\n".repeat(100) };
  const pages = buildPages(result, hero);
  for (const page of pages) {
    assert.ok(page.title.length <= 256);
    assert.ok(!page.title.includes("\n"));
    assert.ok(page.title.includes("\\*\\*name\\*\\*"));
    assert.ok(page.description.length <= 4096);
    assert.ok(page.fields.length <= 25);
    let length = page.title.length + page.description.length + page.footer.text.length;
    for (const field of page.fields) {
      assert.ok(field.name.length > 0 && field.name.length <= 256);
      assert.ok(field.value.length > 0 && field.value.length <= 1024);
      length += field.name.length + field.value.length;
    }
    assert.ok(length <= 6000);
  }
});
