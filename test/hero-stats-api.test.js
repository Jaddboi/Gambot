// Tests hero catalog resolution and filtered career requests using dummy credentials and mocked fetch.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getHeroes } = require("../lib/marvel-rivals-api/get-heroes");
const { getPlayerHeroStatsByUid } = require("../lib/marvel-rivals-api/get-player-hero-stats");
const { resolveHero } = require("../lib/services/resolve-hero");
const { withMockFetch } = require("./helpers/mock-fetch.cjs");
const fixture = require("./fixtures/hero-stats.json");

const apiKey = "dummy-key";
const baseUrl = "https://hero-api.example";
const { uid } = fixture.player;
const heroId = fixture.hero.id;

async function withHeroApi(check) {
  const state = {
    requests: [],
    heroes: [fixture.hero, { id: 1001, name: "IRON MAN" }],
    respond: async (url) => {
      if (url.pathname === "/heroes") return Response.json({ heroes: state.heroes });
      const match = url.pathname.match(/^\/players\/(\d+)\/heroes\/(\d+)$/);
      assert.ok(match, `Unexpected request: ${url.pathname}`);
      return Response.json({
        ...fixture,
        player: { ...fixture.player, uid: match[1] },
        hero: { ...fixture.hero, id: Number(match[2]) },
        filters: {
          season: url.searchParams.has("season") ? Number(url.searchParams.get("season")) : null,
          game_mode: url.searchParams.has("game_mode") ? Number(url.searchParams.get("game_mode")) : null,
        },
      });
    },
  };
  await withMockFetch(async (input, options) => {
    const url = new URL(input);
    state.requests.push(url);
    assert.equal(options.headers["x-api-key"], apiKey);
    assert.equal(url.searchParams.has("api_key"), false);
    return state.respond(url);
  }, () => check(state));
}

test("hero catalog requests are shared and cached for exactly one hour", async (t) => {
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  await withHeroApi(async (state) => {
    const results = await Promise.all([getHeroes(apiKey, baseUrl), getHeroes(apiKey, baseUrl)]);
    assert.deepEqual(results[0], state.heroes);
    assert.equal(results[0], results[1]);
    assert.equal(state.requests.length, 1);
    assert.equal(state.requests[0].href, `${baseUrl}/heroes`);
    now += 3_600_000 - 1;
    await getHeroes(apiKey, baseUrl);
    assert.equal(state.requests.length, 1);
    now++;
    await getHeroes(apiKey, baseUrl);
    await getHeroes(apiKey, "https://other-hero-api.example");
    assert.equal(state.requests.length, 3);
  });
});

test("malformed hero catalogs are rejected without caching, while an empty catalog is valid", async () => {
  for (const body of [null, {}, { heroes: {} }, { heroes: [null] },
    { heroes: [{ id: 0, name: "Hero" }] }, { heroes: [{ id: "1039", name: "Hero" }] },
    { heroes: [{ id: 100001, name: "Hero" }] }, { heroes: [{ id: 1.5, name: "Hero" }] },
    { heroes: [{ id: 1, name: " " }] }, { heroes: [fixture.hero, fixture.hero] }]) {
    await withHeroApi(async (state) => {
      const originalRespond = state.respond;
      state.respond = async () => Response.json(body);
      await assert.rejects(getHeroes(apiKey, baseUrl), /invalid hero catalog data/);
      state.respond = originalRespond;
      assert.deepEqual(await getHeroes(apiKey, baseUrl), state.heroes);
      assert.equal(state.requests.length, 2);
    });
  }
  await withHeroApi(async (state) => {
    state.heroes = [];
    assert.deepEqual(await getHeroes(apiKey, baseUrl), []);
    assert.deepEqual(await resolveHero("Spider-Man", apiKey, baseUrl), { hero: null, suggestions: [] });
    assert.equal(state.requests.length, 1);
  });
});

test("hero names ignore case, punctuation, spacing, and Unicode presentation forms", async () => {
  await withHeroApi(async (state) => {
    for (const name of ["Spider-Man", "spiderman", " SPIDER MAN ", "Ｓｐｉｄｅｒ－Ｍａｎ"]) {
      const result = await resolveHero(name, apiKey, baseUrl);
      assert.equal(result.hero.id, heroId);
      assert.deepEqual(result.suggestions, []);
    }
    assert.equal(state.requests.length, 1);
    const partial = await resolveHero("iron", apiKey, baseUrl);
    assert.equal(partial.hero, null, "A partial name should not guess the intended hero");
    assert.deepEqual(partial.suggestions.map((hero) => hero.name), ["IRON MAN"]);
    assert.deepEqual(await resolveHero("not a hero", apiKey, baseUrl), { hero: null, suggestions: [] });
  });
});

test("ambiguous names and role forms need an explicit unique full name", async () => {
  await withHeroApi(async (state) => {
    state.heroes = [
      { id: 1, name: "DEADPOOL VANGUARD" }, { id: 2, name: "DEADPOOL DUELIST" },
      { id: 3, name: "DEADPOOL STRATEGIST" },
      { id: 4, name: "Spider-Man" }, { id: 5, name: "Spider Man" },
    ];
    const forms = await resolveHero("deadpool", apiKey, baseUrl);
    assert.equal(forms.hero, null);
    assert.equal(forms.suggestions.length, 3);
    assert.equal((await resolveHero("deadpool strategist", apiKey, baseUrl)).hero.id, 3);
    assert.equal((await resolveHero("spiderman", apiKey, baseUrl)).hero, null);
    for (const name of [null, "", " -- ", "x".repeat(101)]) {
      assert.deepEqual(await resolveHero(name, apiKey, baseUrl), { hero: null, suggestions: [] });
    }
    assert.equal(state.requests.length, 1);
  });
});

test("hero stats send catalog IDs and selected filters while preserving fractional matches and wins", async () => {
  await withHeroApi(async (state) => {
    const result = await getPlayerHeroStatsByUid(uid, heroId, apiKey, baseUrl, { season: 312, mode: 2 });
    assert.equal(state.requests.length, 1);
    assert.equal(state.requests[0].pathname, `/players/${uid}/heroes/${heroId}`);
    assert.equal(state.requests[0].searchParams.get("season"), "312");
    assert.equal(state.requests[0].searchParams.get("game_mode"), "2");
    assert.equal(result.career.matches, 12.5);
    assert.equal(result.career.wins, 8.25);
  });
});

test("hero stats cache keys separate player, hero, season, mode, and API origin", async () => {
  await withHeroApi(async (state) => {
    const get = (playerUid = uid, id = heroId, filters = {}, origin = baseUrl) =>
      getPlayerHeroStatsByUid(playerUid, id, apiKey, origin, filters);
    await get();
    await get();
    await get(uid, heroId, { season: null, mode: null });
    assert.equal(state.requests.length, 1);
    assert.equal(state.requests[0].search, "");
    await get("987654321");
    await get(uid, 1001);
    await get(uid, heroId, { season: 312 });
    await get(uid, heroId, { mode: 1 });
    await get(uid, heroId, { mode: 2 });
    await get(uid, heroId, {}, "https://other-hero-api.example");
    assert.equal(state.requests.length, 7);
  });
});

test("hero stats expire at exactly 60 seconds", async (t) => {
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  await withHeroApi(async (state) => {
    await getPlayerHeroStatsByUid(uid, heroId, apiKey, baseUrl);
    now += 59_999;
    await getPlayerHeroStatsByUid(uid, heroId, apiKey, baseUrl);
    assert.equal(state.requests.length, 1);
    now++;
    await getPlayerHeroStatsByUid(uid, heroId, apiKey, baseUrl);
    assert.equal(state.requests.length, 2);
  });
});

test("invalid inputs and configuration are rejected before requests or warm cache hits", async () => {
  await withHeroApi(async (state) => {
    await getPlayerHeroStatsByUid(uid, heroId, apiKey, baseUrl);
    await getHeroes(apiKey, baseUrl);
    for (const id of ["1039", 0, -1, 1.5, 100001, NaN, "../hero"]) {
      await assert.rejects(getPlayerHeroStatsByUid(uid, id, apiKey, baseUrl), /Hero ID/);
    }
    await assert.rejects(getPlayerHeroStatsByUid("../player", heroId, apiKey, baseUrl), /Player UID/);
    await assert.rejects(getPlayerHeroStatsByUid(uid, heroId, apiKey, baseUrl, { season: 9.5 }), /Season/);
    await assert.rejects(getPlayerHeroStatsByUid(uid, heroId, apiKey, baseUrl, { mode: 3 }), /Mode/);
    for (const [key, origin] of [["", baseUrl], [" ", baseUrl], [apiKey, ""], [apiKey, "http://hero-api.example"]]) {
      await assert.rejects(getPlayerHeroStatsByUid(uid, heroId, key, origin));
      await assert.rejects(getHeroes(key, origin));
    }
    assert.equal(state.requests.length, 2);
  });
});

test("wrong players/heroes, malformed bodies, and ignored filters cannot be cached as selected stats", async () => {
  const valid = { ...fixture, filters: { season: 312, game_mode: 2 } };
  const malformed = [null, {}, { ...valid, player: { ...fixture.player, uid: "987654321" } },
    { ...valid, hero: { ...fixture.hero, id: 1001 } }, { ...valid, hero: null },
    { ...valid, career: null }, { ...valid, career: [] }, { ...valid, filters: [] },
    { ...valid, filters: {} }, { ...valid, filters: { season: 307, game_mode: 2 } },
    { ...valid, filters: { season: 312, game_mode: 1 } }];
  for (const body of malformed) {
    await withHeroApi(async (state) => {
      const originalRespond = state.respond;
      state.respond = async () => Response.json(body);
      await assert.rejects(getPlayerHeroStatsByUid(uid, heroId, apiKey, baseUrl, { season: 312, mode: 2 }), /invalid hero stats data/);
      state.respond = originalRespond;
      await getPlayerHeroStatsByUid(uid, heroId, apiKey, baseUrl, { season: 312, mode: 2 });
      assert.equal(state.requests.length, 2);
    });
  }
});

test("concurrent hero-stat calls share pending work and retry after a shared failure", async () => {
  await withHeroApi(async (state) => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    state.respond = async () => { await gate; return new Response("Private upstream details", { status: 503 }); };
    const first = getPlayerHeroStatsByUid(uid, heroId, apiKey, baseUrl);
    const second = getPlayerHeroStatsByUid(uid, heroId, apiKey, baseUrl);
    assert.equal(state.requests.length, 1);
    release();
    const results = await Promise.allSettled([first, second]);
    assert.ok(results.every((result) => result.status === "rejected"));
    assert.equal(results[0].reason, results[1].reason);
    assert.equal(results[0].reason.message.includes("Private upstream details"), false);
    state.respond = async () => Response.json(fixture);
    const successful = await Promise.all([
      getPlayerHeroStatsByUid(uid, heroId, apiKey, baseUrl),
      getPlayerHeroStatsByUid(uid, heroId, apiKey, baseUrl),
    ]);
    assert.equal(successful[0], successful[1]);
    assert.equal(state.requests.length, 2);
  });
});
