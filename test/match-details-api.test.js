// Tests match-detail validation, caching, and shared pending work without live API access.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getMatchDetailsByUid } = require("../lib/marvel-rivals-api/get-match-details");
const { clearCache } = require("../lib/cache");
const { clearRateLimits } = require("../lib/marvel-rivals-api/request");
const fixture = require("./fixtures/match-details.json");
const baseUrl = "https://match-detail-test.example";

async function withApi(check) {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const state = { now: 1000, calls: [], respond: async () => Response.json(fixture) };
  clearCache(); clearRateLimits();
  Date.now = () => state.now;
  globalThis.fetch = async (url, options) => {
    state.calls.push({ url, options });
    return state.respond(url, options);
  };
  try { await check(state); } finally {
    globalThis.fetch = originalFetch; Date.now = originalNow;
    clearCache(); clearRateLimits();
  }
}

const lookup = () => getMatchDetailsByUid(fixture.match_uid, "dummy-key", baseUrl);

test("match details share pending requests and cache results until exactly 60 seconds", async () => {
  await withApi(async (state) => {
    let resolve;
    const response = new Promise((done) => { resolve = done; });
    state.respond = () => response;
    const first = lookup();
    const second = lookup();
    assert.equal(state.calls.length, 1);
    assert.equal(state.calls[0].url.href, `${baseUrl}/matches/${fixture.match_uid}`);
    assert.equal(state.calls[0].options.headers["x-api-key"], "dummy-key");
    resolve(Response.json(fixture));
    assert.deepEqual(await Promise.all([first, second]), [fixture, fixture]);
    state.now += 59_999;
    await lookup();
    assert.equal(state.calls.length, 1);
    state.respond = async () => Response.json(fixture);
    state.now++;
    await lookup();
    assert.equal(state.calls.length, 2);
  });
});

test("match-detail validation runs before cache hits and rejects unsafe paths", async () => {
  await withApi(async (state) => {
    await lookup();
    for (const id of [null, "", "../secrets", "dummy-match", "1_2_3_4", "1_2_3_4_5/extra", "1".repeat(161)]) {
      await assert.rejects(getMatchDetailsByUid(id, "dummy-key", baseUrl), /Match ID/);
    }
    await assert.rejects(getMatchDetailsByUid(fixture.match_uid, "", baseUrl), /API key/);
    await assert.rejects(getMatchDetailsByUid(fixture.match_uid, "dummy-key", ""), /base URL/);
    await assert.rejects(getMatchDetailsByUid(fixture.match_uid, "dummy-key", "http://match-detail-test.example"), /HTTPS/);
    assert.equal(state.calls.length, 1);
  });
});

test("malformed match details are rejected and not cached", async () => {
  const malformed = [
    null, {}, { ...fixture, match_uid: "wrong" }, { ...fixture, teams: null },
    { ...fixture, players: [] }, { ...fixture, players: null },
    { ...fixture, played_at: "bad-date" },
    { ...fixture, teams: [{ id: 1, result: "unknown" }] },
    ...[
      null, { ...fixture.players[0], uid: "" }, { ...fixture.players[0], team_id: "2" },
      { ...fixture.players[0], result: "unknown" }, { ...fixture.players[0], heroes: null },
      { ...fixture.players[0], heroes: [{ id: -1 }] },
    ].map((player) => ({ ...fixture, players: [player] })),
  ];
  for (const body of malformed) {
    await withApi(async (state) => {
      state.respond = async () => Response.json(body);
      await assert.rejects(lookup(), /invalid match details/);
      state.respond = async () => Response.json(fixture);
      assert.deepEqual(await lookup(), fixture);
      assert.equal(state.calls.length, 2);
    });
  }
});

test("shared detail failures reject all callers and permit another attempt", async () => {
  await withApi(async (state) => {
    state.respond = async () => new Response(null, { status: 503 });
    const results = await Promise.allSettled([lookup(), lookup()]);
    assert.ok(results.every((result) => result.status === "rejected"));
    assert.equal(state.calls.length, 1);
    state.respond = async () => Response.json(fixture);
    assert.deepEqual(await lookup(), fixture);
    assert.equal(state.calls.length, 2);
  });
});

test("different matches and API origins do not share detail cache entries", async () => {
  await withApi(async (state) => {
    state.respond = async (url) => Response.json({ ...fixture, match_uid: url.pathname.split("/")[2] });
    const otherId = fixture.match_uid.replace(/11$/, "12");
    await lookup();
    await getMatchDetailsByUid(otherId, "dummy-key", baseUrl);
    await getMatchDetailsByUid(fixture.match_uid, "dummy-key", "https://other-matches.example");
    assert.equal(state.calls.length, 3);
  });
});
