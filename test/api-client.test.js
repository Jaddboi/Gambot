// Tests player lookups with dummy credentials and mocked requests; never loads .env.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getPlayerProfileByUid } = require("../lib/marvel-rivals-api/get-player-profile");
const { getPlayerCareerStatsByUid } = require("../lib/marvel-rivals-api/get-player-career-stats");
const { searchPlayerByUsername } = require("../lib/marvel-rivals-api/search-player-by-username");

const baseUrl = "https://api.rivalsisland.com";
const apiKey = "dummy-key";
const uid = "1235808159";

async function withMockFetch(mock, check) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    await check();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("username search encodes the name and returns the player in one request", async () => {
  let calls = 0;
  const player = { uid, name: "A & B?#", account_level: 20, exact_match: true };
  await withMockFetch(async (url, options) => {
    calls++;
    assert.equal(url.origin, baseUrl);
    assert.equal(url.pathname, "/players/search");
    assert.equal(url.searchParams.get("name"), player.name);
    assert.equal(options.headers["x-api-key"], apiKey);
    assert.equal(options.headers.Accept, "application/json");
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ query: player.name, player, extra_field: true });
  }, async () => {
    assert.deepEqual(await searchPlayerByUsername(`  ${player.name}  `, apiKey, baseUrl), player);
    assert.equal(calls, 1);
  });
});

test("invalid usernames are rejected before a request is sent", async () => {
  await withMockFetch(async () => assert.fail("Must not send a request"), async () => {
    for (const username of [undefined, null, 123, "", "   ", "a".repeat(17)]) {
      await assert.rejects(searchPlayerByUsername(username, apiKey, baseUrl), /1–16 characters/);
    }
  });
});

test("the username length limit counts Unicode characters", async () => {
  const username = "🦸".repeat(16);
  await withMockFetch(async url => {
    assert.equal(url.searchParams.get("name"), username);
    return Response.json({ query: username, player: { uid, name: username } });
  }, async () => {
    assert.equal((await searchPlayerByUsername(username, apiKey, baseUrl)).name, username);
    await assert.rejects(searchPlayerByUsername(`${username}x`, apiKey, baseUrl), /1–16 characters/);
  });
});

test("a successful search with a null player reports no match", async () => {
  await withMockFetch(async () => Response.json({ query: "missing", player: null }), async () => {
    await assert.rejects(searchPlayerByUsername("missing", apiKey, baseUrl), /Player not found/);
  });
});

test("malformed search results are not treated as valid players", async () => {
  for (const result of [{}, null, { player: {} }, { player: { uid: "invalid", name: "Test" } }]) {
    await withMockFetch(async () => Response.json(result), async () => {
      await assert.rejects(searchPlayerByUsername("Test", apiKey, baseUrl), /invalid player data/);
    });
  }
});

test("UID lookup still returns the profile from its own endpoint", async () => {
  const profile = { uid, name: "Test Player", account_level: 20 };
  await withMockFetch(async url => {
    assert.equal(url.href, `${baseUrl}/players/${uid}`);
    return Response.json(profile);
  }, async () => {
    assert.deepEqual(await getPlayerProfileByUid(uid, apiKey, baseUrl), profile);
  });
});

test("username lookup supplies the UID for a single career request", async () => {
  const requests = [];
  const player = { uid, name: "Test Player", exact_match: true };
  const result = {
    player: { uid, name: player.name },
    filters: { season: null, game_mode: null, device_type: null },
    career: { matches: 0, wins: 0, win_rate: null, kd: null, kda: null },
    extra_field: true,
  };
  await withMockFetch(async (url, options) => {
    requests.push(url.pathname);
    if (url.pathname === "/players/search") {
      return Response.json({ query: player.name, player });
    }
    assert.equal(url.href, `${baseUrl}/players/${uid}/career`);
    assert.equal(options.headers["x-api-key"], apiKey);
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json(result);
  }, async () => {
    const found = await searchPlayerByUsername(player.name, apiKey, baseUrl);
    assert.deepEqual(await getPlayerCareerStatsByUid(found.uid, apiKey, baseUrl), result);
    assert.deepEqual(requests, ["/players/search", `/players/${uid}/career`]);
  });
});

test("malformed career results are rejected", async () => {
  const valid = { player: { uid, name: "Test" }, filters: {}, career: { matches: 0 } };
  for (const result of [
    null, {}, { ...valid, player: { uid: "999", name: "Wrong player" } },
    { ...valid, career: null }, { ...valid, career: [] },
    { ...valid, filters: null }, { ...valid, filters: [] },
  ]) {
    await withMockFetch(async () => Response.json(result), async () => {
      await assert.rejects(getPlayerCareerStatsByUid(uid, apiKey, baseUrl), /invalid career data/);
    });
  }
});

test("all lookups validate configuration before sending credentials", async () => {
  await withMockFetch(async () => assert.fail("Must not send a request"), async () => {
    for (const lookup of [getPlayerProfileByUid.bind(null, uid), getPlayerCareerStatsByUid.bind(null, uid), searchPlayerByUsername.bind(null, "Test")]) {
      await assert.rejects(lookup(" ", baseUrl), /API key is required/);
      await assert.rejects(lookup(apiKey, ""), /API base URL is required/);
      await assert.rejects(lookup(apiKey, "http://example.test"), /HTTPS/);
    }
    await assert.rejects(getPlayerProfileByUid("0123", apiKey, baseUrl), /Player UID/);
    for (const invalidUid of [undefined, null, 123, "", "0123", "../search", "1".repeat(21)]) {
      await assert.rejects(getPlayerCareerStatsByUid(invalidUid, apiKey, baseUrl), /Player UID/);
    }
  });
});

test("shared request handling preserves the HTTP error messages", async () => {
  const messages = new Map([
    [401, "The API key is missing or invalid."],
    [402, "The API account has insufficient credits."],
    [403, "Access denied. The data may be private or require a different plan."],
    [404, "Player not found."],
    [422, "The API rejected the request parameters."],
    [429, "Too many requests. Please try again later."],
    [503, "Player lookup failed with HTTP status 503."],
  ]);
  for (const [status, message] of messages) {
    await withMockFetch(async () => new Response(null, { status }), async () => {
      await assert.rejects(searchPlayerByUsername("Test", apiKey, baseUrl), { message });
      await assert.rejects(getPlayerProfileByUid(uid, apiKey, baseUrl), { message });
      await assert.rejects(getPlayerCareerStatsByUid(uid, apiKey, baseUrl), { message });
    });
  }
});

test("request and body failures retain their safe error messages", async () => {
  await withMockFetch(async () => {
    throw new DOMException("Simulated timeout", "TimeoutError");
  }, async () => {
    await assert.rejects(searchPlayerByUsername("Test", apiKey, baseUrl), /lookup timed out/);
  });
  await withMockFetch(async () => {
    throw new TypeError("Simulated network failure");
  }, async () => {
    await assert.rejects(searchPlayerByUsername("Test", apiKey, baseUrl), /Could not connect/);
  });
  await withMockFetch(async () => new Response("not json", { status: 200 }), async () => {
    await assert.rejects(searchPlayerByUsername("Test", apiKey, baseUrl), /invalid JSON/);
  });
  for (const name of ["AbortError", "TimeoutError", "TypeError"]) {
    await withMockFetch(async () => ({ ok: true, json: async () => {
      const error = new Error("Simulated reading failure");
      error.name = name;
      throw error;
    } }), async () => {
      await assert.rejects(searchPlayerByUsername("Test", apiKey, baseUrl), name === "TypeError" ? /Could not read/ : /lookup timed out/);
    });
  }
});
