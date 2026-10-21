// Tests native scoreboard fields, safe formatting, embed limits, and lazy fallback.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildMatchScoreboard } = require("../lib/scoreboards/build-match-scoreboard");
const { createDetailedHistoryPages } = require("../lib/scoreboards/create-detailed-history-pages");
const { clearCache } = require("../lib/cache");
const { clearRateLimits } = require("../lib/marvel-rivals-api/request");
const fixture = require("./fixtures/match-details.json");
const selectedUid = "123456789";
const player = { uid: selectedUid, name: "CampusPlayer" };

async function withFetch(fetch, check) {
  const original = globalThis.fetch;
  clearCache(); clearRateLimits();
  globalThis.fetch = fetch;
  try { await check(); } finally {
    globalThis.fetch = original;
    clearCache(); clearRateLimits();
  }
}

test("a normal match has exactly three cards with named leaderboard rows for both teams", () => {
  const before = JSON.stringify(fixture);
  const cards = buildMatchScoreboard(player, fixture, 0, 2).map((embed) => embed.toJSON());
  assert.equal(cards.length, 3);
  assert.equal(cards[0].title, "CampusPlayer — Match History");
  assert.equal(cards[0].fields.find((field) => field.name === "Kills").value, "22");
  assert.equal(cards[1].title, "Team 2 · WIN · Score 2");
  assert.equal(cards[2].title, "Team 1 · LOSS · Score 0");
  for (const team of cards.slice(1)) {
    assert.ok(team.description.startsWith("```text\nPLAYER"));
    assert.equal(team.fields, undefined, "Each team should be one table, without separate lookup fields");
    assert.ok(team.footer.text.includes("Sorted by kills"));
    const lines = team.description.split("\n").slice(1, -1);
    assert.equal(lines.length, 13, "Header, six stat rows, and six hero lines");
    const statRows = lines.filter((_, index) => index % 2 === 1);
    assert.equal(new Set(statRows.map((line) => [...line].length)).size, 1);
  }
  assert.match(cards[1].description, /> CampusPlayer\s+22\/6\/6\s+15\s+18.6k\s+9.9k\s+0\s+56%/);
  assert.ok(cards[1].description.indexOf("LibraryCarry") < cards[1].description.indexOf("CampusTank"));
  assert.ok(cards[1].description.includes("[MVP]"));
  assert.ok(cards[2].description.includes("[SVP]"));
  assert.equal(JSON.stringify(fixture), before);
});

test("each player lists one most-played hero and the overview retains its hero thumbnail", () => {
  const data = structuredClone(fixture);
  const heroes = data.players.find((entry) => entry.uid === selectedUid).heroes;
  heroes[0].icon = "https://assets.rivalsisland.com/squirrel-girl.png";
  heroes[1].icon = "https://assets.rivalsisland.com/hela.png";
  heroes.reverse();
  const cards = buildMatchScoreboard(player, data, 0, 1).map((embed) => embed.toJSON());
  assert.equal(cards[0].thumbnail.url, "https://assets.rivalsisland.com/squirrel-girl.png");
  assert.ok(cards[1].description.includes("Squirrel Girl"));
  assert.equal(JSON.stringify(cards).includes("Hela"), false);
  assert.equal(cards.some((card) => card.image), false);
});

test("thumbnail URLs are restricted to the provider and do not require portrait downloads", async () => {
  await withFetch(() => assert.fail("Building tables must not download portraits"), async () => {
    const data = structuredClone(fixture);
    const hero = data.players.find((entry) => entry.uid === selectedUid).heroes[0];
    for (const url of [null, "not a URL", "file:///etc/passwd", "http://assets.rivalsisland.com/a.png", "https://evil.example/a.png", "https://assets.rivalsisland.com.evil.example/a.png", "https://user:secret@assets.rivalsisland.com/a.png", "https://assets.rivalsisland.com:8443/a.png"]) {
      hero.icon = url;
      const [overview] = buildMatchScoreboard(player, data, 0, 1);
      assert.equal(overview.toJSON().thumbnail, undefined);
    }
  });
});

test("missing stats stay unavailable, zero stays valid, and names cannot break table code blocks", () => {
  const data = structuredClone(fixture);
  data.players[0].name = "Fake\n```MVP";
  data.players[0].kills = null;
  data.players[0].accuracy = 56;
  data.players[0].healing = 0;
  data.players[0].heroes = [];
  const cards = buildMatchScoreboard(player, data, 0, 1).map((embed) => embed.toJSON());
  const table = cards[1].description;
  assert.equal((table.match(/```/g) ?? []).length, 2);
  assert.match(table, /Fake\s+MVP\s+—\/3\/20\s+2\s+16.2k\s+30.8k\s+0\s+—/);
  assert.ok(table.includes("Unavailable"));
  const individual = buildMatchScoreboard(player, { ...fixture, teams: [] }, 0, 1);
  assert.equal(individual.length, 2, "Do not invent a second team for individual modes");
  assert.equal(individual[1].data.title, "Participants");
});

test("large rosters and unusual team counts stay within three cards and disclose truncation", () => {
  for (const separateTeams of [false, true]) {
    const data = structuredClone(fixture);
    data.players = Array.from({ length: 64 }, (_, index) => ({
      ...structuredClone(fixture.players[index % 12]),
      uid: String(index + 1),
      team_id: separateTeams ? index : 2,
      name: "Long name ".repeat(10),
      kills: Number.MAX_VALUE,
    }));
    data.players[63].uid = selectedUid;
    const cards = buildMatchScoreboard(player, data, 0, 1);
    assert.ok(cards.length <= 3);
    assert.ok(cards.reduce((sum, embed) => sum + embed.length, 0) <= 6000);
    for (const card of cards) {
      const json = card.toJSON();
      assert.ok(json.title.length <= 256);
      assert.ok(json.description.length <= 4096);
    }
    if (separateTeams) {
      assert.match(cards[0].data.footer.text, /Showing 2\/64 teams/);
      assert.ok(cards.some((card) => card.data.title.startsWith("Team 63")));
    } else {
      assert.match(cards[1].data.footer.text, /players shown/);
    }
  }
});

test("lazy detail failure shows the summary and retries when revisited", async () => {
  const history = { matches: [{ match_uid: fixture.match_uid, result: "win", played_at: fixture.played_at, player: { kills: 22 } }] };
  let calls = 0;
  await withFetch(async () => {
    calls++;
    const details = structuredClone(fixture);
    details.players.find((player) => player.uid === selectedUid).rank = { change: 25 };
    return calls === 1 ? new Response(null, { status: 503 }) : Response.json(details);
  }, async () => {
    const pages = createDetailedHistoryPages({ uid: selectedUid, name: "CampusPlayer" }, history, "dummy-key", "https://match-scoreboard.example");
    assert.equal(calls, 0);
    const fallback = await pages[0]();
    assert.match(fallback.embeds[0].description, /Full scoreboard unavailable/);
    assert.deepEqual(fallback.attachments, []);
    assert.deepEqual(fallback.files, []);
    const full = await pages[0]();
    const overview = full.embeds[0];
    assert.equal(overview.image, undefined);
    assert.deepEqual(full.files, []);
    assert.match(overview.description, /Rank change: \*\*\+25\*\*/);
    assert.equal(overview.fields.find((field) => field.name === "Kills").value, "22");
    assert.strictEqual(await pages[0](), full);
    assert.equal(calls, 2);
  });
});

test("a detail response without the searched player falls back instead of presenting another player's match", async () => {
  await withFetch(async () => Response.json(fixture), async () => {
    const pages = createDetailedHistoryPages({ uid: "999999", name: "Other Player" }, {
      matches: [{ match_uid: fixture.match_uid, result: "win", played_at: fixture.played_at }],
    }, "dummy-key", "https://match-scoreboard.example");
    assert.match((await pages[0]()).embeds[0].description, /Full scoreboard unavailable/);
  });
});
