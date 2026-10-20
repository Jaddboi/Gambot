// Tests simultaneous career lookups with dummy credentials and mocked requests.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { clearCache } = require("../lib/cache");
const { clearRateLimits } = require("../lib/marvel-rivals-api/request");
const { getPlayerCareerStatsByUid } = require("../lib/marvel-rivals-api/get-player-career-stats");

const apiKey = "dummy-key";
const baseUrl = "https://shared-lookups.example";
const uid = "1235808159";

function careerResult(playerUid = uid, matches = 40) {
  return {
    player: { uid: playerUid, name: "Dummy Player" },
    filters: { season: null, game_mode: null, device_type: null },
    career: { matches, wins: 20 },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function withFakeApi(check) {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const state = {
    now: 1000,
    requests: [],
    respond: async () => Response.json(careerResult()),
  };

  clearCache();
  clearRateLimits();
  Date.now = () => state.now;
  globalThis.fetch = async (url, options) => {
    state.requests.push(new URL(url));
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

test("simultaneous career lookups share one request and then use the completed cache", async () => {
  await withFakeApi(async state => {
    const response = deferred();
    state.respond = () => response.promise;
    const lookups = [
      getPlayerCareerStatsByUid(uid, apiKey, baseUrl),
      getPlayerCareerStatsByUid(uid, apiKey, baseUrl),
      getPlayerCareerStatsByUid(uid, apiKey, baseUrl),
    ];
    assert.equal(state.requests.length, 1);
    await assert.rejects(getPlayerCareerStatsByUid(uid, "", baseUrl), /API key is required/);

    response.resolve(Response.json(careerResult()));
    assert.deepEqual(await Promise.all(lookups), Array(3).fill(careerResult()));
    assert.deepEqual(await getPlayerCareerStatsByUid(uid, apiKey, baseUrl), careerResult());
    assert.equal(state.requests.length, 1);

    // An expired cache entry must cause a fresh request, not reuse a settled Promise.
    state.now += 60_000;
    state.respond = async () => Response.json(careerResult(uid, 41));
    assert.deepEqual(await getPlayerCareerStatsByUid(uid, apiKey, baseUrl), careerResult(uid, 41));
    assert.equal(state.requests.length, 2);
  });
});

test("lookups remain shared while the response body is still being read", async () => {
  await withFakeApi(async state => {
    const body = deferred();
    const readingStarted = deferred();
    state.respond = async () => ({
      ok: true,
      json: () => {
        readingStarted.resolve();
        return body.promise;
      },
    });

    const first = getPlayerCareerStatsByUid(uid, apiKey, baseUrl);
    await readingStarted.promise;
    const second = getPlayerCareerStatsByUid(uid, apiKey, baseUrl);
    assert.equal(state.requests.length, 1);

    body.resolve(careerResult());
    assert.deepEqual(await Promise.all([first, second]), [careerResult(), careerResult()]);
  });
});

test("different players and servers do not share pending career requests", async () => {
  await withFakeApi(async state => {
    const responses = [];
    state.respond = () => {
      const response = deferred();
      responses.push(response);
      return response.promise;
    };
    const otherUid = "999000111";
    const lookups = [
      getPlayerCareerStatsByUid(uid, apiKey, baseUrl),
      getPlayerCareerStatsByUid(otherUid, apiKey, baseUrl),
      getPlayerCareerStatsByUid(uid, apiKey, "https://other-lookups.example"),
    ];
    assert.equal(state.requests.length, 3);
    assert.equal(state.requests[1].pathname, `/players/${otherUid}/career`);
    assert.equal(state.requests[2].origin, "https://other-lookups.example");

    responses[0].resolve(Response.json(careerResult()));
    responses[1].resolve(Response.json(careerResult(otherUid)));
    responses[2].resolve(Response.json(careerResult()));
    assert.deepEqual(await Promise.all(lookups), [
      careerResult(), careerResult(otherUid), careerResult(),
    ]);
  });
});

const failures = [
  ["network failure", response => response.reject(new TypeError("Simulated failure")), /Could not connect/],
  ["HTTP error", response => response.resolve(new Response(null, { status: 503 })), /HTTP status 503/],
  ["invalid career data", response => response.resolve(Response.json({})), /invalid career data/],
];

for (const [name, failResponse, expectedError] of failures) {
  test(`shared ${name} rejects every caller and allows a fresh attempt`, async () => {
    await withFakeApi(async state => {
      const response = deferred();
      state.respond = () => response.promise;
      const lookups = Promise.allSettled([
        getPlayerCareerStatsByUid(uid, apiKey, baseUrl),
        getPlayerCareerStatsByUid(uid, apiKey, baseUrl),
      ]);
      assert.equal(state.requests.length, 1);

      failResponse(response);
      for (const result of await lookups) {
        assert.equal(result.status, "rejected");
        assert.match(result.reason.message, expectedError);
      }

      state.respond = async () => Response.json(careerResult());
      assert.deepEqual(await getPlayerCareerStatsByUid(uid, apiKey, baseUrl), careerResult());
      assert.equal(state.requests.length, 2);
      await getPlayerCareerStatsByUid(uid, apiKey, baseUrl);
      assert.equal(state.requests.length, 2);
    });
  });
}
