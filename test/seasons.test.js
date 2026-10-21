// Tests season lookup, caching, selection, and labels using dummy settings and mocked requests.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadCommand } = require("./helpers/load-command.cjs");
const { EventEmitter } = require("node:events");
const { ApplicationCommandOptionType } = require("discord.js");
const { clearCache } = require("../lib/cache");
const { clearRateLimits } = require("../lib/marvel-rivals-api/request");
const { getSeasons } = require("../lib/marvel-rivals-api/get-seasons");
const { buildPlayerStatsPages } = require("../lib/embeds/stats/build-player-stats-pages");

const apiKey = "dummy-key";
const baseUrl = "https://season-tests.example";
const player = { uid: "123456789", name: "Dummy Player" };
// Deliberately unrelated IDs ensure the command uses the catalog instead of calculating IDs.
const seasons = [
  { id: 301, number: "0" },
  { id: 307, number: "9.0" },
  { id: 312, number: "9.5" },
];

async function withFakeApi(check) {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const state = {
    now: 1000,
    requests: [],
    respond: async (url) => {
      if (url.pathname === "/seasons") return Response.json({ seasons });
      if (url.pathname === "/players/search") return Response.json({ player });
      if (url.pathname === `/players/${player.uid}/career`) {
        const season = url.searchParams.get("season");
        const mode = url.searchParams.get("game_mode");
        return Response.json({
          player,
          filters: {
            season: season === null ? null : Number(season),
            game_mode: mode === null ? null : Number(mode),
          },
          career: { matches: 10, wins: 5 },
        });
      }
      assert.equal(url.pathname, `/players/${player.uid}/proficiency`);
      return Response.json({ uid: player.uid, heroes: [] });
    },
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

const loadStatsCommand = () => loadCommand("stats", { apiKey, baseUrl });

async function executeStats(season, mode = null, allSeasons = null) {
  const payloads = [];
  let deferred = false;
  const collector = new EventEmitter();
  const message = { createMessageComponentCollector: () => collector };
  await loadStatsCommand().execute({
    user: { id: "owner" },
    options: {
      getString: () => player.name,
      getNumber: (name) => { assert.equal(name, "season"); return season; },
      getBoolean: (name) => { assert.equal(name, "all-seasons"); return allSeasons; },
      getInteger: (name) => { assert.equal(name, "mode"); return mode; },
    },
    deferReply: async () => { deferred = true; },
    editReply: async (payload) => {
      assert.ok(deferred, "The command must acknowledge the interaction before replying");
      payloads.push(payload);
      return message;
    },
  });
  return payloads;
}

test("season catalog returns public numbers and IDs from the authenticated endpoint", async () => {
  await withFakeApi(async (state) => {
    assert.deepEqual(await getSeasons(apiKey, baseUrl), seasons);
    assert.equal(state.requests.length, 1);
    assert.equal(state.requests[0].url.href, `${baseUrl}/seasons`);
    assert.equal(state.requests[0].options.headers["x-api-key"], apiKey);
  });
});

test("season catalog cache expires at exactly one hour and separates API origins", async () => {
  await withFakeApi(async (state) => {
    await getSeasons(apiKey, baseUrl);
    state.now += 3_600_000 - 1;
    assert.deepEqual(await getSeasons(apiKey, baseUrl), seasons);
    assert.equal(state.requests.length, 1);

    const updated = [...seasons, { id: 320, number: "10" }];
    state.respond = async () => Response.json({ seasons: updated });
    state.now++;
    assert.deepEqual(await getSeasons(apiKey, baseUrl), updated);
    assert.equal(state.requests.length, 2);
    await getSeasons(apiKey, "https://other-season-tests.example");
    assert.equal(state.requests.length, 3);
  });
});

test("an empty season list is valid and cached", async () => {
  await withFakeApi(async (state) => {
    state.respond = async () => Response.json({ seasons: [] });
    assert.deepEqual(await getSeasons(apiKey, baseUrl), []);
    assert.deepEqual(await getSeasons(apiKey, baseUrl), []);
    assert.equal(state.requests.length, 1);
  });
});

test("invalid season configuration is rejected even after warming the cache", async () => {
  await withFakeApi(async (state) => {
    await getSeasons(apiKey, baseUrl);
    await assert.rejects(getSeasons("", baseUrl), /API key is required/);
    await assert.rejects(getSeasons("  ", baseUrl), /API key is required/);
    await assert.rejects(getSeasons(apiKey, ""), /base URL is required/);
    await assert.rejects(getSeasons(apiKey, "not-a-url"), /Invalid URL/);
    await assert.rejects(getSeasons(apiKey, "http://season-tests.example"), /HTTPS/);
    assert.equal(state.requests.length, 1);
  });
});

test("malformed season responses are rejected without caching and allow a valid retry", async () => {
  const malformed = [
    null, {}, { seasons: {} }, { seasons: [null] },
    ...[
      { id: 0, number: "9.5" },
      { id: -1, number: "9.5" },
      { id: 1.5, number: "9.5" },
      { id: "312", number: "9.5" },
      { id: Number.MAX_SAFE_INTEGER + 1, number: "9.5" },
      { id: 312, number: 9.5 },
      { id: 312, number: "9.25" },
      { id: 312, number: "" },
      { id: 312 },
    ].map((entry) => ({ seasons: [seasons[0], entry] })),
  ];
  for (const body of malformed) {
    await withFakeApi(async (state) => {
      state.respond = async () => Response.json(body);
      await assert.rejects(getSeasons(apiKey, baseUrl), /invalid season data/);
      state.respond = async () => Response.json({ seasons });
      assert.deepEqual(await getSeasons(apiKey, baseUrl), seasons);
      assert.equal(state.requests.length, 2);
    });
  }
});

test("failed season requests are not cached and permit another attempt", async () => {
  await withFakeApi(async (state) => {
    state.respond = async () => new Response(null, { status: 503 });
    await assert.rejects(getSeasons(apiKey, baseUrl), /HTTP status 503/);
    state.respond = async () => Response.json({ seasons });
    assert.deepEqual(await getSeasons(apiKey, baseUrl), seasons);
    assert.equal(state.requests.length, 2);
  });
});

test("stats registration supports decimal seasons, an all-seasons flag, and integer mode choices", () => {
  const options = loadStatsCommand().data.toJSON().options;
  const season = options.find((option) => option.name === "season");
  assert.equal(season.type, ApplicationCommandOptionType.Number);
  assert.equal(season.required, false);
  assert.equal(season.min_value, 0);
  const allSeasons = options.find((option) => option.name === "all-seasons");
  assert.equal(allSeasons.type, ApplicationCommandOptionType.Boolean);
  assert.equal(allSeasons.required, false);
  const mode = options.find((option) => option.name === "mode");
  assert.equal(mode.type, ApplicationCommandOptionType.Integer);
  assert.deepEqual(mode.choices.map(({ value }) => value), [1, 2]);
});

for (const [number, id, label] of [[9.5, 312, "9.5"], [9, 307, "9.0"], [0, 301, "0"]]) {
  test(`stats translates public season ${number} to its catalog ID and displays its number`, async () => {
    await withFakeApi(async (state) => {
      const payloads = await executeStats(number, 2);
      const career = state.requests.find(({ url }) => url.pathname.endsWith("/career"));
      assert.equal(career.url.searchParams.get("season"), String(id));
      assert.equal(career.url.searchParams.get("game_mode"), "2");
      assert.equal(payloads[0].embeds[0].description, `Career stats • Season ${label} • Competitive`);
      assert.deepEqual(state.requests.map(({ url }) => url.pathname), [
        "/seasons", "/players/search", `/players/${player.uid}/career`, `/players/${player.uid}/proficiency`,
      ]);
    });
  });
}

test("omitting season skips the catalog and preserves default career filters", async () => {
  await withFakeApi(async (state) => {
    const payloads = await executeStats(null);
    assert.equal(state.requests.some(({ url }) => url.pathname === "/seasons"), false);
    const career = state.requests.find(({ url }) => url.pathname.endsWith("/career"));
    assert.equal(career.url.search, "");
    assert.equal(payloads[0].embeds[0].description, "Career stats • API default season • API default mode");
  });
});

test("unavailable seasons stop before player lookup, including 0.5, quarter seasons, and future seasons", async () => {
  for (const number of [0.5, 9.25, 999]) {
    await withFakeApi(async (state) => {
      const payloads = await executeStats(number);
      assert.deepEqual(state.requests.map(({ url }) => url.pathname), ["/seasons"]);
      assert.equal(payloads.length, 1);
      assert.match(payloads[0], /That season is unavailable/);
    });
  }
});

test("career pages show the public number only for a matching returned season ID", () => {
  for (const [returnedId, selected, label] of [
    [312, seasons[2], "Season 9.5"],
    [307, seasons[2], "Season ID: 307"],
    [312, null, "Season ID: 312"],
    [null, null, "API default season"],
  ]) {
    const pages = buildPlayerStatsPages({ player, result: {
      player, career: {}, filters: { season: returnedId, game_mode: 1 },
    }, proficiency: null, selectedSeason: selected }).map((page) => page.toJSON());
    for (const page of pages.slice(0, 3)) {
      assert.equal(page.description, `Career stats • ${label} • Quick Play`);
    }
    assert.doesNotMatch(pages[3].description, /Career stats|Season 9\.5/);
  }
});

test("all-seasons requests omit the season filter and preserve the selected mode", async () => {
  for (const [mode, modeLabel] of [[null, "API default mode"], [1, "Quick Play"], [2, "Competitive"]]) {
    await withFakeApi(async (state) => {
      const payloads = await executeStats(null, mode, true);
      const career = state.requests.find(({ url }) => url.pathname.endsWith("/career"));
      assert.equal(career.url.searchParams.has("season"), false);
      assert.equal(career.url.searchParams.get("game_mode"), mode === null ? null : String(mode));
      assert.equal(payloads[0].embeds[0].description, `Career stats • All seasons • ${modeLabel}`);
      assert.deepEqual(state.requests.map(({ url }) => url.pathname), [
        "/players/search", `/players/${player.uid}/career`, `/players/${player.uid}/proficiency`,
      ]);
    });
  }
});

test("all-seasons conflicts with a specific season before any API request, including season zero", async () => {
  for (const season of [0, 9.5]) {
    await withFakeApi(async (state) => {
      const payloads = await executeStats(season, null, true);
      assert.equal(state.requests.length, 0);
      assert.equal(payloads.length, 1);
      assert.match(payloads[0], /Choose either a specific season or all-seasons:true/);
    });
  }
});

test("all-seasons false allows a specific season and preserves the default when none is selected", async () => {
  for (const [season, expectedId, label] of [[9.5, "312", "Season 9.5"], [null, null, "API default season"]]) {
    await withFakeApi(async (state) => {
      const payloads = await executeStats(season, null, false);
      const career = state.requests.find(({ url }) => url.pathname.endsWith("/career"));
      assert.equal(career.url.searchParams.get("season"), expectedId);
      assert.equal(payloads[0].embeds[0].description, `Career stats • ${label} • API default mode`);
    });
  }
});

test("all-seasons does not present season-specific or unconfirmed API responses as combined stats", async () => {
  for (const filters of [{ season: 312 }, {}]) {
    await withFakeApi(async (state) => {
      const defaultRespond = state.respond;
      state.respond = async (url) => url.pathname.endsWith("/career")
        ? Response.json({ player, filters, career: {} })
        : defaultRespond(url);
      const payloads = await executeStats(null, null, true);
      assert.equal(payloads.length, 1);
      assert.match(payloads[0], /did not confirm an all-seasons result/);
      assert.deepEqual(state.requests.map(({ url }) => url.pathname), [
        "/players/search", `/players/${player.uid}/career`,
      ]);
    });
  }
});

test("all-seasons uses the unfiltered career cache separately from a specific season", async () => {
  await withFakeApi(async (state) => {
    const defaultRespond = state.respond;
    state.respond = async (url) => {
      if (!url.pathname.endsWith("/career")) return defaultRespond(url);
      const season = url.searchParams.get("season");
      return Response.json({
        player,
        filters: { season: season === null ? null : Number(season), game_mode: 2 },
        career: { matches: season === null ? 100 : 10, wins: 5 },
      });
    };
    const specific = await executeStats(9.5, 2);
    const combined = await executeStats(null, 2, true);
    const repeated = await executeStats(null, 2, true);
    assert.equal(state.requests.filter(({ url }) => url.pathname.endsWith("/career")).length, 2);
    const matches = (payload) => payload.embeds[0].fields.find((field) => field.name === "Matches").value;
    assert.equal(matches(specific[0]), "10");
    assert.equal(matches(combined[0]), "100");
    assert.equal(matches(repeated[0]), "100");
  });
});

test("all-seasons labels apply to all career pages without changing rank metadata or proficiency labels", () => {
  const result = {
    player: { ...player, rank: { season: "9.5", rank: "Diamond I" } },
    career: {},
    filters: { season: null, game_mode: 2 },
  };
  const pages = buildPlayerStatsPages({ player, result, allSeasons: true }).map((page) => page.toJSON());
  for (const page of pages.slice(0, 3)) {
    assert.equal(page.description, "Career stats • All seasons • Competitive");
  }
  assert.equal(pages[0].fields.find((field) => field.name === "Rank season").value, "9.5");
  assert.doesNotMatch(pages[3].description, /All seasons/);

  for (const [filters, label] of [[{ season: 312 }, "Season ID: 312"], [{}, "API default season"]]) {
    const [overview] = buildPlayerStatsPages({ player, result: { ...result, filters }, allSeasons: true });
    assert.equal(overview.toJSON().description, `Career stats • ${label} • API default mode`);
  }
});
