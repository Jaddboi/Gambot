// Tests history command embeds and navigation with mocked requests and isolated dummy settings.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadCommand } = require("./helpers/load-command.cjs");
const { EventEmitter, once } = require("node:events");
const { clearCache } = require("../lib/cache");
const { clearRateLimits } = require("../lib/marvel-rivals-api/request");
const fixture = require("./fixtures/match-details.json");

const player = { uid: "123456789", name: "Dummy Player" };
const matches = ["win", "loss"].map((result, index) => ({
  match_uid: `100001_1792598400_1001_11001_${11 + index}`,
  result,
  played_at: "2026-10-21T12:00:00Z",
  map: { name: `Test Map ${index + 1}` },
  game_mode: "Competitive",
  player: { kills: 10 + index, deaths: 0, assists: 5, rank: { change: index === 0 ? 25 : -20 } },
}));

async function runHistory(mode, returnedMatches, check) {
  const command = loadCommand("history", { apiKey: "dummy-key", baseUrl: "https://history-command.example" });

  const originalFetch = globalThis.fetch;
  const requests = [];
  const payloads = [];
  const collector = new EventEmitter();
  const replies = new EventEmitter();
  collector.ended = false;
  let deferred = false;
  let collectorCount = 0;
  const message = {
    edit: () => assert.fail("History must edit the original interaction reply"),
    createMessageComponentCollector: () => { collectorCount++; return collector; },
  };

  clearCache();
  clearRateLimits();
  globalThis.fetch = async (input, options) => {
    assert.ok(deferred, "Acknowledge before making API requests");
    assert.equal(options.headers["x-api-key"], "dummy-key");
    const url = new URL(input);
    requests.push(url);
    assert.equal(url.origin, "https://history-command.example");
    if (url.pathname === "/players/search") {
      assert.equal(url.searchParams.get("name"), player.name);
      return Response.json({ player });
    }
    if (url.pathname.startsWith("/matches/")) {
      const details = structuredClone(fixture);
      details.match_uid = url.pathname.split("/")[2];
      const winningTeam = details.match_uid === matches[0].match_uid ? 2 : 1;
      for (const team of details.teams) {
        team.result = team.id === winningTeam ? "win" : "loss";
        team.score = team.id === winningTeam ? 2 : 0;
      }
      for (const participant of details.players) participant.result = participant.team_id === winningTeam ? "win" : "loss";
      const selected = details.players.find((entry) => entry.uid === player.uid);
      selected.heroes = winningTeam === 2
        ? [{ id: 1020, name: "Squirrel Girl", icon: "https://assets.rivalsisland.com/squirrel-girl.png" }]
        : [{ id: 1030, name: "Moon Knight", icon: "https://assets.rivalsisland.com/moon-knight.png" }];
      return Response.json(details);
    }
    assert.equal(url.pathname, `/players/${player.uid}/match-history`);
    assert.equal(url.searchParams.get("page"), "0");
    assert.equal(url.searchParams.get("page_size"), "20");
    assert.equal(url.searchParams.get("category"), mode === null ? null : String(mode));
    return Response.json({
      uid: player.uid,
      matches: returnedMatches,
      pagination: { page: 0, page_size: 20, has_more: false },
    });
  };

  try {
    await command.execute({
      user: { id: "owner" },
      options: { getString: () => player.name, getInteger: () => mode },
      deferReply: async () => { deferred = true; },
      editReply: async (payload) => { payloads.push(payload); replies.emit("reply"); return message; },
    });
    const waitForPayload = async (count) => {
      while (payloads.length < count) await once(replies, "reply", { signal: AbortSignal.timeout(5000) });
    };
    await check({ requests, payloads, collector, collectorCount, waitForPayload });
  } finally {
    globalThis.fetch = originalFetch;
    clearCache();
    clearRateLimits();
  }
}

test("history automatically loads visible scoreboards and reuses them on back navigation", async () => {
  for (const mode of [null, 1, 2]) {
    await runHistory(mode, matches, async ({ requests, payloads, collector, collectorCount, waitForPayload }) => {
      assert.equal(collectorCount, 1);
      assert.equal(payloads[0].content, "Page 1 / 2");
      assert.match(payloads[0].embeds[0].description, /^Result: \*\*win\*\*/);
      assert.equal(payloads[0].embeds[0].image, undefined);
      assert.equal(payloads[0].embeds[0].thumbnail.url, "https://assets.rivalsisland.com/squirrel-girl.png");
      assert.equal(payloads[0].embeds.length, 3);
      assert.ok(payloads[0].embeds[1].description.includes("> CampusPlayer"));
      assert.ok(payloads[0].embeds[1].description.includes("Squirrel Girl"));
      assert.equal(payloads[0].components.length, 1, "Only match navigation should be visible");
      assert.equal(requests.length, 3, "Only the first visible match should load initially");

      let expectedPayloads = 1;
      for (const [direction, result] of [["next", "loss"], ["previous", "win"]]) {
        let acknowledged = false;
        collector.emit("collect", {
          customId: `gambot:pages:${direction}`,
          user: { id: "owner" },
          deferUpdate: async () => { acknowledged = true; },
        });
        await waitForPayload(++expectedPayloads);
        assert.ok(acknowledged);
        assert.ok(payloads.at(-1).embeds[0].description.startsWith(`Result: **${result}**`));
      }
      assert.equal(payloads[1].content, "Page 2 / 2");
      assert.equal(payloads[1].embeds[0].image, undefined);
      assert.equal(payloads[1].embeds[1].title, "Team 1 · WIN · Score 2");
      assert.equal(payloads[1].embeds[2].title, "Team 2 · LOSS · Score 0");
      assert.equal(payloads[1].embeds.length, 3);
      assert.equal(payloads[1].embeds[0].thumbnail.url, "https://assets.rivalsisland.com/moon-knight.png");
      assert.equal(payloads[2].content, "Page 1 / 2");
      assert.equal(payloads[2].embeds[0].thumbnail.url, "https://assets.rivalsisland.com/squirrel-girl.png");
      assert.equal(requests.length, 4, "Returning to an opened match must not fetch its details again");
    });
  }
});

test("empty history displays an explanation without navigation controls", async () => {
  await runHistory(null, [], async ({ requests, payloads, collectorCount }) => {
    assert.equal(collectorCount, 0);
    assert.equal(payloads.length, 1);
    assert.equal(payloads[0].embeds[0].description, "No matches were returned for this page.");
    assert.deepEqual(payloads[0].components, []);
    assert.equal(requests.length, 2);
  });
});

test("one returned match shows both team tables without any navigation controls", async () => {
  await runHistory(null, [matches[0]], async ({ requests, payloads, collectorCount }) => {
    assert.equal(collectorCount, 0);
    assert.deepEqual(payloads[0].components, []);
    assert.equal(payloads[0].embeds.length, 3);
    assert.equal(payloads[0].embeds[1].title, "Team 2 · WIN · Score 2");
    assert.equal(payloads[0].embeds[2].title, "Team 1 · LOSS · Score 0");
    assert.equal(requests.length, 3);
  });
});
