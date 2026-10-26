// Tests API rate-limit waits with mocked requests and a fake clock; never loads .env.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  requestApi,
  clearRateLimits,
} = require("../lib/marvel-rivals-api/request");

const apiKey = "dummy-key";
const playerUrl = new URL("https://rate-limit-test.example/players/123");
const rateLimitError = /Too many requests/;

// Restore globals and shared state even if an assertion fails.
async function withFakeApi(check) {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const state = {
    now: 1000,
    requests: [],
    respond: async () => Response.json({ ok: true }),
  };

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
    clearRateLimits();
  }
}

test("429 blocks further fetches until the exact retry time", async () => {
  await withFakeApi(async state => {
    state.respond = async () => state.requests.length === 1
      ? new Response(null, { status: 429, headers: { "Retry-After": "2" } })
      : Response.json({ ok: true });

    await assert.rejects(requestApi(playerUrl, apiKey), rateLimitError);
    assert.equal(state.requests.length, 1);

    state.now = 2999;
    await assert.rejects(requestApi(playerUrl, apiKey), rateLimitError);
    await assert.rejects(requestApi(playerUrl, ""), /API key is required/);
    assert.equal(state.requests.length, 1);

    state.now = 3000;
    assert.deepEqual(await requestApi(playerUrl, apiKey), { ok: true });
    assert.equal(state.requests.length, 2);
  });
});

test("rate-limit errors expose a safe status and the shared retry deadline", async () => {
  await withFakeApi(async (state) => {
    state.respond = async () => new Response("Private upstream details", { status: 429, headers: { "Retry-After": "2" } });
    const check = (error) => {
      assert.equal(error.status, 429);
      assert.equal(error.retryAt, 3000);
      assert.equal(error.message, "Too many requests. Please try again later.");
      return true;
    };
    await assert.rejects(requestApi(playerUrl, apiKey), check);
    state.now = 1500;
    await assert.rejects(requestApi(playerUrl, apiKey), check);
    assert.equal(state.requests.length, 1);
  });
});

test("retry headers support priority, rounding, conversion, and fallback", async () => {
  const cases = [
    [{ "X-RateLimit-Retry-After-Ms": "1500", "Retry-After": "9" }, 1500],
    [{ "X-RateLimit-Retry-After-Ms": "1.2" }, 2],
    [{ "Retry-After": "3" }, 3000],
    [{ "X-RateLimit-Retry-After-Ms": "invalid", "Retry-After": "2" }, 2000],
    [{ "X-RateLimit-Retry-After-Ms": "0", "Retry-After": "2" }, 2000],
    [{}, 1000],
    [{ "X-RateLimit-Retry-After-Ms": "-1", "Retry-After": "invalid" }, 1000],
    [{ "X-RateLimit-Retry-After-Ms": "Infinity", "Retry-After": "1e308" }, 1000],
    [{ "X-RateLimit-Retry-After-Ms": "", "Retry-After": " " }, 1000],
  ];

  for (const [headers, expectedDelay] of cases) {
    await withFakeApi(async state => {
      state.respond = async () => state.requests.length === 1
        ? new Response(null, { status: 429, headers })
        : Response.json({ ok: true });

      await assert.rejects(requestApi(playerUrl, apiKey), rateLimitError);
      state.now = 1000 + expectedDelay - 1;
      await assert.rejects(requestApi(playerUrl, apiKey), rateLimitError);
      assert.equal(state.requests.length, 1);

      state.now++;
      assert.deepEqual(await requestApi(playerUrl, apiKey), { ok: true });
      assert.equal(state.requests.length, 2);
    });
  }
});

test("a wait covers other endpoints on the same server but not other servers", async () => {
  await withFakeApi(async state => {
    state.respond = async () => state.requests.length === 1
      ? new Response(null, { status: 429, headers: { "Retry-After": "3" } })
      : Response.json({ ok: true });

    await assert.rejects(requestApi(playerUrl, apiKey), rateLimitError);
    const otherEndpoint = new URL("/heroes", playerUrl);
    await assert.rejects(requestApi(otherEndpoint, apiKey), rateLimitError);
    assert.equal(state.requests.length, 1);

    const otherServer = new URL("https://independent-test.example/heroes");
    assert.deepEqual(await requestApi(otherServer, apiKey), { ok: true });
    assert.equal(state.requests.length, 2);
    assert.equal(state.requests[1].origin, otherServer.origin);
  });
});

for (const [firstDelay, secondDelay] of [[5, 1], [1, 5]]) {
  test(`overlapping 429 responses preserve the later deadline (${firstDelay}s then ${secondDelay}s)`, async () => {
    await withFakeApi(async state => {
      const pending = [];
      state.respond = () => new Promise(resolve => pending.push(resolve));

      // Both requests start before either response has established a wait.
      const first = assert.rejects(requestApi(playerUrl, apiKey), rateLimitError);
      const second = assert.rejects(requestApi(playerUrl, apiKey), rateLimitError);
      assert.equal(pending.length, 2);

      pending[0](new Response(null, {
        status: 429, headers: { "Retry-After": String(firstDelay) },
      }));
      await first;

      state.now = 1100;
      pending[1](new Response(null, {
        status: 429, headers: { "Retry-After": String(secondDelay) },
      }));
      await second;

      state.respond = async () => Response.json({ ok: true });
      const expectedRetryAt = Math.max(1000 + firstDelay * 1000, 1100 + secondDelay * 1000);
      state.now = expectedRetryAt - 1;
      await assert.rejects(requestApi(playerUrl, apiKey), rateLimitError);
      assert.equal(state.requests.length, 2);

      state.now = expectedRetryAt;
      assert.deepEqual(await requestApi(playerUrl, apiKey), { ok: true });
      assert.equal(state.requests.length, 3);
    });
  });
}

test("clearing rate limits removes an active wait for test isolation", async () => {
  await withFakeApi(async state => {
    state.respond = async () => state.requests.length === 1
      ? new Response(null, { status: 429, headers: { "Retry-After": "30" } })
      : Response.json({ ok: true });

    await assert.rejects(requestApi(playerUrl, apiKey), rateLimitError);
    clearRateLimits();
    assert.deepEqual(await requestApi(playerUrl, apiKey), { ok: true });
    assert.equal(state.requests.length, 2);
  });
});
