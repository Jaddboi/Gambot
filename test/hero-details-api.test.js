// Tests hero-detail validation, shared requests, failures, and caching with dummy configuration.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getHeroDetailsById } = require("../lib/marvel-rivals-api/get-hero-details");
const { withMockFetch } = require("./helpers/mock-fetch.cjs");
const fixture = require("./fixtures/hero-details.json");

const apiKey = "dummy-key";
const baseUrl = "https://hero-details.example";

async function withHeroApi(check) {
  const state = {
    requests: [],
    respond: async (url) => Response.json({ ...fixture, id: Number(url.pathname.split("/").at(-1)) }),
  };
  await withMockFetch(async (input, options) => {
    const url = new URL(input);
    state.requests.push(url);
    assert.equal(options.headers["x-api-key"], apiKey);
    assert.equal(url.search, "");
    return state.respond(url);
  }, () => check(state));
}

test("hero details read a bare response object, share requests, and expire at one hour", async (t) => {
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  await withHeroApi(async (state) => {
    const [first, second] = await Promise.all([
      getHeroDetailsById(fixture.id, apiKey, baseUrl),
      getHeroDetailsById(fixture.id, apiKey, baseUrl),
    ]);
    assert.deepEqual(first, fixture);
    assert.equal(first, second);
    assert.equal(state.requests.length, 1);
    assert.equal(state.requests[0].href, `${baseUrl}/heroes/${fixture.id}`);
    now += 3_600_000 - 1;
    await getHeroDetailsById(fixture.id, apiKey, baseUrl);
    assert.equal(state.requests.length, 1);
    now++;
    await getHeroDetailsById(fixture.id, apiKey, baseUrl);
    assert.equal(state.requests.length, 2);
  });
});

test("hero details separate hero IDs and API origins in the shared cache", async () => {
  await withHeroApi(async (state) => {
    assert.equal((await getHeroDetailsById(1039, apiKey, baseUrl)).id, 1039);
    assert.equal((await getHeroDetailsById(1052, apiKey, baseUrl)).id, 1052);
    await getHeroDetailsById(1039, apiKey, "https://other-hero-details.example");
    await getHeroDetailsById(1039, apiKey, baseUrl);
    assert.equal(state.requests.length, 3);
  });
});

test("hero IDs and credentials are validated before requests and warm cache hits", async () => {
  await withHeroApi(async (state) => {
    await getHeroDetailsById(fixture.id, apiKey, baseUrl);
    for (const id of [null, "1039", 0, -1, 1.5, 100001, NaN, "../heroes"]) {
      await assert.rejects(getHeroDetailsById(id, apiKey, baseUrl), /Hero ID/);
    }
    for (const [key, origin] of [["", baseUrl], [" ", baseUrl], [apiKey, ""], [apiKey, "http://hero-details.example"]]) {
      await assert.rejects(getHeroDetailsById(fixture.id, key, origin));
    }
    assert.equal(state.requests.length, 1);
  });
});

test("malformed detail responses and wrong hero IDs are rejected without caching", async () => {
  const malformed = [null, {}, { hero: fixture }, { ...fixture, id: 1052 },
    { ...fixture, name: " " }, { ...fixture, role: 1 }, { ...fixture, biography: {} },
    { ...fixture, real_name: 1 }, { ...fixture, description: [] }, { ...fixture, icon: {} },
    { ...fixture, icons: [] }, { ...fixture, icons: { regular: {} } },
    { ...fixture, teamups: {} }, { ...fixture, teamups: [null] },
    { ...fixture, teamups: [{ id: 0, name: "Invalid" }] },
    { ...fixture, teamups: [{ id: 1, name: " " }] },
    { ...fixture, skin_ids: {} }, { ...fixture, skin_ids: [1] }, { ...fixture, skin_ids: ["../skin"] }];
  for (const body of malformed) {
    await withHeroApi(async (state) => {
      const respond = state.respond;
      state.respond = async () => Response.json(body);
      await assert.rejects(getHeroDetailsById(fixture.id, apiKey, baseUrl), /invalid hero details/);
      state.respond = respond;
      assert.deepEqual(await getHeroDetailsById(fixture.id, apiKey, baseUrl), fixture);
      assert.equal(state.requests.length, 2);
    });
  }
});

test("missing optional data and additional API fields remain compatible", async () => {
  await withHeroApi(async (state) => {
    const result = {
      id: fixture.id, name: fixture.name, role: fixture.role,
      real_name: null, biography: null, icons: null, teamups: null, skin_ids: null,
      future_field: { anything: true },
    };
    state.respond = async () => Response.json(result);
    assert.deepEqual(await getHeroDetailsById(fixture.id, apiKey, baseUrl), result);
  });
});

test("shared detail failures propagate safely and allow a later retry", async () => {
  await withHeroApi(async (state) => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    state.respond = async () => { await gate; return new Response("Private upstream details", { status: 503 }); };
    const first = getHeroDetailsById(fixture.id, apiKey, baseUrl);
    const second = getHeroDetailsById(fixture.id, apiKey, baseUrl);
    assert.equal(state.requests.length, 1);
    release();
    const results = await Promise.allSettled([first, second]);
    assert.ok(results.every((result) => result.status === "rejected"));
    assert.equal(results[0].reason, results[1].reason);
    assert.equal(results[0].reason.message.includes("Private upstream details"), false);
    state.respond = async () => Response.json(fixture);
    assert.deepEqual(await getHeroDetailsById(fixture.id, apiKey, baseUrl), fixture);
    assert.equal(state.requests.length, 2);
  });
});
