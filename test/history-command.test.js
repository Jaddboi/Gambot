// Tests history command embeds and navigation with mocked requests and isolated dummy settings.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { EventEmitter } = require("node:events");
const { clearCache } = require("../lib/cache");
const { clearRateLimits } = require("../lib/marvel-rivals-api/request");

const player = { uid: "123456789", name: "Dummy Player" };
const matches = ["win", "loss"].map((result, index) => ({
  match_uid: `dummy-match-${index}`,
  result,
  played_at: "2026-10-21T12:00:00Z",
  map: { name: `Test Map ${index + 1}` },
  game_mode: "Competitive",
  player: { kills: 10 + index, deaths: 0, assists: 5, rank: { change: index === 0 ? 25 : -20 } },
}));

async function runHistory(mode, returnedMatches, check) {
  const filename = path.resolve(__dirname, "../commands/history.js");
  const context = {
    require: createRequire(filename),
    module: { exports: {} },
    process: { env: {
      MARVEL_RIVALS_API_KEY: "dummy-key",
      MARVEL_RIVALS_API_BASE_URL: "https://history-command.example",
    } },
  };
  // Evaluate the command with dummy configuration, never dotenv or real environment settings.
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), context, { filename });

  const originalFetch = globalThis.fetch;
  const requests = [];
  const payloads = [];
  const collector = new EventEmitter();
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
    await context.module.exports.execute({
      user: { id: "owner" },
      options: { getString: () => player.name, getInteger: () => mode },
      deferReply: async () => { deferred = true; },
      editReply: async (payload) => { payloads.push(payload); return message; },
    });
    await check({ requests, payloads, collector, collectorCount });
  } finally {
    globalThis.fetch = originalFetch;
    clearCache();
    clearRateLimits();
  }
}

test("history displays match embeds and navigates them without additional API calls", async () => {
  for (const mode of [null, 1, 2]) {
    await runHistory(mode, matches, async ({ requests, payloads, collector, collectorCount }) => {
      assert.equal(collectorCount, 1);
      assert.equal(payloads[0].content, "Page 1 / 2");
      assert.equal(payloads[0].embeds[0].description, "Result: **win**");
      assert.equal(payloads[0].embeds[0].fields.find(field => field.name === "Deaths").value, "0");

      for (const [direction, result] of [["next", "loss"], ["previous", "win"]]) {
        let acknowledged = false;
        collector.emit("collect", {
          customId: `gambot:pages:${direction}`,
          user: { id: "owner" },
          deferUpdate: async () => { acknowledged = true; },
        });
        await new Promise(resolve => setImmediate(resolve));
        assert.ok(acknowledged);
        assert.equal(payloads.at(-1).embeds[0].description, `Result: **${result}**`);
      }
      assert.equal(payloads[1].content, "Page 2 / 2");
      assert.equal(payloads[1].embeds[0].fields.find(field => field.name === "Rank change").value, "-20");
      assert.equal(payloads[2].content, "Page 1 / 2");
      assert.equal(requests.length, 2);
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
