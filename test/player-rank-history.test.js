// Tests rank-history request validation, season confirmation, cache isolation, sharing, and retries with dummy settings.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getPlayerRankHistoryByUid } = require("../lib/marvel-rivals-api/get-player-rank-history");
const { withMockFetch } = require("./helpers/mock-fetch.cjs");

const playerUid = "123456789";
const apiKey = "dummy-key";
const baseUrl = "https://rank-history.example";
const rank = {
  season_id: 312, season: "9.5", device_type: "pc",
  rank: "Gold I", rank_level: 9, rank_score: 3000,
  peak_rank: "Diamond I", peak_rank_level: 15, peak_rank_score: 4000,
};

function response(season = null, seasons = [rank]) {
  return { uid: playerUid, filters: { season }, seasons };
}

test("rank history sends authenticated season IDs and separates filtered, all-time, player, and origin caches", async () => {
  const requests = [];
  await withMockFetch(async (input, options) => {
    const url = new URL(input);
    requests.push(url);
    assert.equal(options.headers["x-api-key"], apiKey);
    assert.equal(options.redirect, "error");
    const filter = url.searchParams.get("season");
    const seasonId = filter === null ? null : Number(filter);
    const uid = url.pathname.split("/")[2];
    return Response.json({ ...response(seasonId, [{ ...rank, season_id: seasonId ?? 312 }]), uid });
  }, async () => {
    const allTime = await getPlayerRankHistoryByUid(playerUid, apiKey, baseUrl);
    assert.equal(await getPlayerRankHistoryByUid(playerUid, apiKey, baseUrl), allTime);
    await getPlayerRankHistoryByUid(playerUid, apiKey, baseUrl, 312);
    await getPlayerRankHistoryByUid(playerUid, apiKey, baseUrl, 0);
    await getPlayerRankHistoryByUid("987654321", apiKey, baseUrl);
    await getPlayerRankHistoryByUid(playerUid, apiKey, "https://other-ranks.example");
    assert.equal(requests.length, 5);
    assert.equal(requests[0].pathname, `/players/${playerUid}/rank-history`);
    assert.equal(requests[0].searchParams.has("season"), false);
    assert.equal(requests[1].searchParams.get("season"), "312");
    assert.equal(requests[2].searchParams.get("season"), "0");
  });
});

test("rank history checks inputs and credentials before returning warm cache entries", async () => {
  let calls = 0;
  await withMockFetch(async () => {
    calls++;
    return Response.json(response());
  }, async () => {
    await getPlayerRankHistoryByUid(playerUid, apiKey, baseUrl);
    for (const uid of ["../123", "0", 123, "1".repeat(21)]) {
      await assert.rejects(getPlayerRankHistoryByUid(uid, apiKey, baseUrl), /Player UID/);
    }
    for (const season of [9.5, -1, 10001, "312", NaN]) {
      await assert.rejects(getPlayerRankHistoryByUid(playerUid, apiKey, baseUrl, season), /Season must/);
    }
    await assert.rejects(getPlayerRankHistoryByUid(playerUid, "", baseUrl), /API key/);
    await assert.rejects(getPlayerRankHistoryByUid(playerUid, apiKey, ""), /base URL/);
    await assert.rejects(getPlayerRankHistoryByUid(playerUid, apiKey, "http://rank-history.example"), /HTTPS/);
    assert.equal(calls, 1);
  });
});

test("wrong players, ignored season filters, duplicate platform entries, and malformed ranks are rejected without caching", async () => {
  const malformed = [
    { ...response(312), uid: "987654321" },
    { ...response(312), filters: null },
    { ...response(312), filters: {} },
    response(null),
    response(307),
    response(312, [{ ...rank, season_id: 307 }]),
    { ...response(312), seasons: {} },
    response(312, [null]),
    response(312, [rank, rank]),
    response(312, [{ ...rank, device_type: "unknown" }]),
    response(312, [{ ...rank, rank: 123 }]),
    response(312, [{ ...rank, peak_rank_score: "4000" }]),
    response(312, [{ ...rank, rank_level: -1 }]),
  ];
  for (const invalid of malformed) {
    let calls = 0;
    await withMockFetch(async () => Response.json(++calls === 1 ? invalid : response(312)), async () => {
      await assert.rejects(getPlayerRankHistoryByUid(playerUid, apiKey, baseUrl, 312), /invalid rank history/);
      const valid = await getPlayerRankHistoryByUid(playerUid, apiKey, baseUrl, 312);
      assert.equal(valid.seasons[0].season_id, 312);
      assert.equal(calls, 2);
    });
  }
});

test("all-time rejects a filtered or unconfirmed subset rather than declaring an all-time peak", async () => {
  for (const filters of [{ season: 312 }, {}, null]) {
    await withMockFetch(async () => Response.json({ ...response(), filters }), async () => {
      await assert.rejects(getPlayerRankHistoryByUid(playerUid, apiKey, baseUrl), /invalid rank history/);
    });
  }
});

test("empty history and nullable rank fields remain valid without inventing unranked data", async () => {
  for (const seasons of [[], [{ ...rank, rank: null, rank_score: null, peak_rank: null, peak_rank_level: null }]]) {
    await withMockFetch(async () => Response.json(response(null, seasons)), async () => {
      const result = await getPlayerRankHistoryByUid(playerUid, apiKey, baseUrl);
      assert.deepEqual(result.seasons, seasons);
    });
  }
});

test("simultaneous history lookups share a request and the cache expires at exactly 60 seconds", async () => {
  const originalNow = Date.now;
  let now = originalNow();
  let calls = 0;
  let finish;
  Date.now = () => now;
  try {
    await withMockFetch(async () => {
      calls++;
      if (calls === 1) await new Promise((resolve) => { finish = resolve; });
      return Response.json(response());
    }, async () => {
      const first = getPlayerRankHistoryByUid(playerUid, apiKey, baseUrl);
      const second = getPlayerRankHistoryByUid(playerUid, apiKey, baseUrl);
      assert.equal(calls, 1);
      finish();
      const [a, b] = await Promise.all([first, second]);
      assert.equal(a, b);
      now += 59_999;
      assert.equal(await getPlayerRankHistoryByUid(playerUid, apiKey, baseUrl), a);
      assert.equal(calls, 1);
      now++;
      await getPlayerRankHistoryByUid(playerUid, apiKey, baseUrl);
      assert.equal(calls, 2);
    });
  } finally {
    Date.now = originalNow;
  }
});

test("shared HTTP failures reject callers and allow a later retry without exposing response contents", async () => {
  let calls = 0;
  await withMockFetch(async () => {
    calls++;
    return calls === 1 ? new Response("private upstream details", { status: 503 }) : Response.json(response());
  }, async () => {
    const lookups = await Promise.allSettled([
      getPlayerRankHistoryByUid(playerUid, apiKey, baseUrl),
      getPlayerRankHistoryByUid(playerUid, apiKey, baseUrl),
    ]);
    for (const lookup of lookups) {
      assert.equal(lookup.status, "rejected");
      assert.equal(lookup.reason.message, "Player lookup failed with HTTP status 503.");
    }
    assert.equal(calls, 1);
    await getPlayerRankHistoryByUid(playerUid, apiKey, baseUrl);
    assert.equal(calls, 2);
  });
});
