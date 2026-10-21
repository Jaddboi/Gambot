// Tests history request validation and caching with dummy credentials and mocked responses.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { clearCache } = require("../lib/cache");
const { clearRateLimits } = require("../lib/marvel-rivals-api/request");
const { getPlayerMatchHistoryByUid } = require("../lib/marvel-rivals-api/get-player-match-history");

const uid = "123456789";
const apiKey = "dummy-key";
const baseUrl = "https://history-api.example";
const match = {
  match_uid: "dummy-match",
  result: "win",
  played_at: "2026-10-21T12:00:00Z",
};

function history(overrides = {}) {
  return {
    uid,
    matches: [match],
    pagination: { page: 0, page_size: 20, has_more: false },
    ...overrides,
  };
}

async function withFakeApi(check) {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const state = {
    now: 1000,
    requests: [],
    respond: async (url) => Response.json(history({ uid: url.pathname.split("/")[2] })),
  };
  clearCache();
  clearRateLimits();
  Date.now = () => state.now;
  globalThis.fetch = async (input, options) => {
    const url = new URL(input);
    state.requests.push({ url, options });
    return state.respond(url, options);
  };
  try {
    await check(state);
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
    clearCache();
    clearRateLimits();
  }
}

test("history requests the newest API page and returns matches with pagination", async () => {
  await withFakeApi(async (state) => {
    const result = await getPlayerMatchHistoryByUid(uid, apiKey, baseUrl);
    assert.deepEqual(result, history());
    assert.equal(state.requests.length, 1);
    const { url, options } = state.requests[0];
    assert.equal(url.href, `${baseUrl}/players/${uid}/match-history?page=0&page_size=20`);
    assert.equal(options.method, "GET");
    assert.equal(options.headers["x-api-key"], apiKey);
  });
});

test("history mode categories have separate cache entries and omitted/null modes share defaults", async () => {
  await withFakeApi(async (state) => {
    for (const filters of [undefined, {}, { mode: null }, { mode: 1 }, { mode: 2 }, { mode: 1 }, { mode: 2 }]) {
      await getPlayerMatchHistoryByUid(uid, apiKey, baseUrl, filters);
    }
    assert.deepEqual(state.requests.map(({ url }) => url.searchParams.get("category")), [null, "1", "2"]);
    assert.ok(state.requests.every(({ url }) => !url.searchParams.has("game_mode")));
  });
});

test("history validates inputs and credentials before returning cached data", async () => {
  await withFakeApi(async (state) => {
    await getPlayerMatchHistoryByUid(uid, apiKey, baseUrl);
    for (const playerUid of [null, 123, "", "0", "0123", "../search", "1".repeat(21)]) {
      await assert.rejects(getPlayerMatchHistoryByUid(playerUid, apiKey, baseUrl), /Player UID/);
    }
    for (const mode of [0, 3, "1", false, 1.5, NaN, Infinity]) {
      await assert.rejects(getPlayerMatchHistoryByUid(uid, apiKey, baseUrl, { mode }), /Mode must/);
    }
    await assert.rejects(getPlayerMatchHistoryByUid(uid, "", baseUrl), /API key/);
    await assert.rejects(getPlayerMatchHistoryByUid(uid, "  ", baseUrl), /API key/);
    await assert.rejects(getPlayerMatchHistoryByUid(uid, apiKey, ""), /base URL/);
    await assert.rejects(getPlayerMatchHistoryByUid(uid, apiKey, "not-a-url"), /Invalid URL/);
    await assert.rejects(getPlayerMatchHistoryByUid(uid, apiKey, "http://history-api.example"), /HTTPS/);
    assert.equal(state.requests.length, 1);
  });
});

test("history cache expires at exactly 60 seconds and returns newly fetched data", async () => {
  await withFakeApi(async (state) => {
    await getPlayerMatchHistoryByUid(uid, apiKey, baseUrl);
    const updated = history({ matches: [] });
    state.respond = async () => Response.json(updated);
    state.now += 59_999;
    assert.deepEqual(await getPlayerMatchHistoryByUid(uid, apiKey, baseUrl), history());
    assert.equal(state.requests.length, 1);
    state.now++;
    assert.deepEqual(await getPlayerMatchHistoryByUid(uid, apiKey, baseUrl), updated);
    assert.equal(state.requests.length, 2);
  });
});

test("history cache separates players and API origins", async () => {
  await withFakeApi(async (state) => {
    const otherUid = "987654321";
    assert.equal((await getPlayerMatchHistoryByUid(uid, apiKey, baseUrl)).uid, uid);
    assert.equal((await getPlayerMatchHistoryByUid(otherUid, apiKey, baseUrl)).uid, otherUid);
    await getPlayerMatchHistoryByUid(uid, apiKey, "https://other-history-api.example");
    assert.equal(state.requests.length, 3);
    assert.equal(state.requests[1].url.pathname, `/players/${otherUid}/match-history`);
    assert.equal(state.requests[2].url.origin, "https://other-history-api.example");
  });
});

test("malformed history responses are not cached and allow a valid retry", async () => {
  const malformedMatches = [
    null, {}, { ...match, match_uid: "" }, { ...match, match_uid: " " },
    { ...match, match_uid: 123 }, { ...match, result: "unknown" },
    { ...match, played_at: "not-a-date" }, { ...match, played_at: null },
  ];
  const malformed = [
    null, {}, history({ uid: "999" }), history({ matches: {} }),
    history({ pagination: null }),
    history({ pagination: { page: 1, page_size: 20, has_more: false } }),
    history({ pagination: { page: 0, page_size: 10, has_more: false } }),
    history({ pagination: { page: 0, page_size: 20, has_more: "false" } }),
    ...malformedMatches.map((entry) => history({ matches: [match, entry] })),
  ];
  for (const body of malformed) {
    await withFakeApi(async (state) => {
      state.respond = async () => Response.json(body);
      await assert.rejects(getPlayerMatchHistoryByUid(uid, apiKey, baseUrl), /invalid match history data/);
      state.respond = async () => Response.json(history());
      assert.deepEqual(await getPlayerMatchHistoryByUid(uid, apiKey, baseUrl), history());
      assert.equal(state.requests.length, 2);
    });
  }
});

test("failed history requests are not cached or automatically retried", async () => {
  await withFakeApi(async (state) => {
    state.respond = async () => new Response(null, { status: 503 });
    await assert.rejects(getPlayerMatchHistoryByUid(uid, apiKey, baseUrl), /HTTP status 503/);
    assert.equal(state.requests.length, 1);
    state.respond = async () => Response.json(history());
    await getPlayerMatchHistoryByUid(uid, apiKey, baseUrl);
    await getPlayerMatchHistoryByUid(uid, apiKey, baseUrl);
    assert.equal(state.requests.length, 2);
  });
});

test("empty history is cached with either has_more value", async () => {
  for (const has_more of [false, true]) {
    await withFakeApi(async (state) => {
      const empty = history({ matches: [], pagination: { page: 0, page_size: 20, has_more } });
      state.respond = async () => Response.json(empty);
      assert.deepEqual(await getPlayerMatchHistoryByUid(uid, apiKey, baseUrl), empty);
      assert.deepEqual(await getPlayerMatchHistoryByUid(uid, apiKey, baseUrl), empty);
      assert.equal(state.requests.length, 1);
    });
  }
});

test("history accepts wins, losses, draws, and abandoned matches", async () => {
  await withFakeApi(async (state) => {
    const results = ["win", "loss", "draw", "abandoned"];
    state.respond = async () => Response.json(history({
      matches: results.map((result, index) => ({ ...match, match_uid: `match-${index}`, result })),
    }));
    const response = await getPlayerMatchHistoryByUid(uid, apiKey, baseUrl);
    assert.deepEqual(response.matches.map((entry) => entry.result), results);
  });
});
