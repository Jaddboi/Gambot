// Tests rank command options, season resolution, and replies with dummy settings and mocked requests.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ApplicationCommandOptionType } = require("discord.js");
const { loadCommand } = require("./helpers/load-command.cjs");
const { withMockFetch } = require("./helpers/mock-fetch.cjs");

const apiKey = "dummy-key";
const baseUrl = "https://rank-command.example";
const player = { uid: "123456789", name: "Dummy Player" };
// Catalog IDs deliberately differ from public numbers to catch accidental direct forwarding.
const seasons = [
  { id: 301, number: "0" },
  { id: 307, number: "9.0" },
  { id: 312, number: "9.5" },
];

async function withRankApi(check) {
  const state = {
    requests: [],
    payloads: [],
    deferred: false,
    rank: { rank: "Diamond I", peak_rank: "Grandmaster III", rank_score: 4200, season: "10.5" },
    history: [
      { season_id: 312, season: "9.5", device_type: "pc", rank: "Gold I", rank_score: 3000,
        peak_rank: "Diamond I", peak_rank_level: 15, peak_rank_score: 4000 },
      { season_id: 307, season: "9.0", device_type: "pc", rank: "Platinum I", rank_score: 3500,
        peak_rank: "Grandmaster III", peak_rank_level: 16, peak_rank_score: 4500 },
      { season_id: 301, season: "0", device_type: "pc", rank: "Unranked", rank_score: 0,
        peak_rank: null, peak_rank_level: null, peak_rank_score: null },
    ],
  };

  state.respond = async (url) => {
    if (url.pathname === "/seasons") return Response.json({ seasons });
    if (url.pathname === "/players/search") {
      assert.equal(url.searchParams.get("name"), player.name);
      return Response.json({ player });
    }
    if (url.pathname.endsWith("/rank-history")) {
      assert.equal(url.pathname, `/players/${player.uid}/rank-history`);
      const filter = url.searchParams.get("season");
      const seasonId = filter === null ? null : Number(filter);
      return Response.json({
        uid: player.uid,
        filters: { season: seasonId },
        seasons: state.history.filter((rank) => seasonId === null || rank.season_id === seasonId),
      });
    }
    assert.equal(url.pathname, `/players/${player.uid}/career`);
    const season = url.searchParams.get("season");
    return Response.json({
      player: { ...player, name: "Rank Player", rank: state.rank },
      filters: { season: season === null ? null : Number(season) },
      career: {},
    });
  };

  const command = loadCommand("rank", { apiKey, baseUrl });
  async function execute(season = null, allTime = null) {
    state.deferred = false;
    await command.execute({
      options: {
        getString: (name, required) => {
          assert.equal(name, "player");
          assert.equal(required, true);
          return player.name;
        },
        getNumber: (name) => {
          assert.equal(name, "season");
          return season;
        },
        getBoolean: (name) => {
          assert.equal(name, "all-time");
          return allTime;
        },
      },
      deferReply: async () => { state.deferred = true; },
      reply: async () => assert.fail("Rank should complete its deferred reply with editReply"),
      editReply: async (payload) => {
        assert.ok(state.deferred);
        // Normalize the VM's reply object and EmbedBuilder into plain JSON.
        state.payloads.push(JSON.parse(JSON.stringify(payload)));
      },
    });
  }

  await withMockFetch(async (input, options) => {
    assert.ok(state.deferred, "Acknowledge before any API requests");
    assert.equal(options.headers["x-api-key"], apiKey);
    const url = new URL(input);
    assert.equal(url.origin, baseUrl);
    state.requests.push(url);
    return state.respond(url);
  }, () => check(state, execute));
}

function fieldValue(embed, name) {
  return embed.fields.find((field) => field.name === name).value;
}

test("rank registers a required username and an optional number season that permits decimals", () => {
  const definition = loadCommand("rank").data.toJSON();
  assert.equal(definition.name, "rank");
  const playerOption = definition.options.find((option) => option.name === "player");
  assert.equal(playerOption.type, ApplicationCommandOptionType.String);
  assert.equal(playerOption.required, true);
  const seasonOption = definition.options.find((option) => option.name === "season");
  assert.equal(seasonOption.type, ApplicationCommandOptionType.Number);
  assert.equal(seasonOption.required, false);
  assert.equal(seasonOption.min_value, 0);
  const allTimeOption = definition.options.find((option) => option.name === "all-time");
  assert.equal(allTimeOption.type, ApplicationCommandOptionType.Boolean);
  assert.equal(allTimeOption.required, false);
});

test("rank defers, searches the username, and replies with the fetched rank embed", async () => {
  await withRankApi(async (state, execute) => {
    await execute();
    assert.deepEqual(state.requests.map((url) => url.pathname), [
      "/players/search", `/players/${player.uid}/career`,
    ]);
    assert.equal(state.requests[1].searchParams.has("season"), false);
    assert.equal(state.payloads.length, 1);
    const payload = state.payloads[0];
    assert.equal(payload.embeds.length, 1);
    assert.equal(payload.embeds[0].title, "Rank Player — Rank");
    assert.equal(fieldValue(payload.embeds[0], "Current rank"), "Diamond I");
    assert.equal(fieldValue(payload.embeds[0], "Peak rank"), "Grandmaster III");
    assert.equal(fieldValue(payload.embeds[0], "Rank score"), "4,200");
    assert.equal(fieldValue(payload.embeds[0], "Rank season"), "10.5");
    assert.equal(payload.embeds[0].thumbnail.url, "https://rivalsisland.com/static/ranks/rank_5.png");
    assert.deepEqual(payload.allowedMentions, { parse: [] });
  });
});

for (const [number, id] of [[9.5, 312], [9, 307], [0, 301]]) {
  test(`rank resolves season ${number} to ID ${id} and uses its history instead of the latest profile rank`, async () => {
    await withRankApi(async (state, execute) => {
      await execute(number);
      assert.deepEqual(state.requests.map((url) => url.pathname), [
        "/seasons", "/players/search", `/players/${player.uid}/rank-history`,
      ]);
      assert.equal(state.requests[2].searchParams.get("season"), String(id));
      const expected = state.history.find((rank) => rank.season_id === id);
      const embed = state.payloads[0].embeds[0];
      assert.equal(fieldValue(embed, "Rank season"), expected.season);
      assert.equal(fieldValue(embed, "Season rank"), expected.rank);
      assert.equal(fieldValue(embed, "Platform"), "PC");
    });
  });
}

test("unavailable seasons stop before player lookup and send an explanation", async () => {
  for (const season of [0.5, 9.25, 999]) {
    await withRankApi(async (state, execute) => {
      await execute(season);
      assert.deepEqual(state.requests.map((url) => url.pathname), ["/seasons"]);
      assert.equal(state.payloads.length, 1);
      assert.match(state.payloads[0], /That season is unavailable/);
    });
  }
});

test("rank completes its reply when the API supplies no rank data", async () => {
  await withRankApi(async (state, execute) => {
    state.rank = null;
    await execute();
    const fields = state.payloads[0].embeds[0].fields;
    assert.equal(fields.length, 4);
    assert.ok(fields.every((field) => field.value === "Unavailable"));
  });
});

test("a missing player rejects before career lookup instead of sending a rank card", async () => {
  await withRankApi(async (state, execute) => {
    state.respond = async () => Response.json({ player: null });
    await assert.rejects(execute(), /Player not found/);
    assert.deepEqual(state.requests.map((url) => url.pathname), ["/players/search"]);
    assert.equal(state.payloads.length, 0);
  });
});

test("career request failures propagate to the interaction handler without a success reply", async () => {
  await withRankApi(async (state, execute) => {
    const normalResponse = state.respond;
    state.respond = async (url) => url.pathname.endsWith("/career")
      ? new Response(null, { status: 503 })
      : normalResponse(url);
    await assert.rejects(execute(), /HTTP status 503/);
    assert.equal(state.deferred, true);
    assert.equal(state.requests.length, 2);
    assert.equal(state.payloads.length, 0);
  });
});

test("all-time requests unfiltered history and shows the highest peak with its own season", async () => {
  await withRankApi(async (state, execute) => {
    await execute(null, true);
    assert.deepEqual(state.requests.map((url) => url.pathname), [
      "/players/search", `/players/${player.uid}/rank-history`,
    ]);
    assert.equal(state.requests[1].searchParams.has("season"), false);
    const embed = state.payloads[0].embeds[0];
    assert.equal(fieldValue(embed, "All-time peak rank"), "Grandmaster III");
    assert.equal(fieldValue(embed, "Peak season"), "9.0");
    assert.equal(fieldValue(embed, "Seasons returned"), "3");
    assert.equal(embed.thumbnail.url, "https://rivalsisland.com/static/ranks/rank_6.png");
    assert.deepEqual(state.payloads[0].allowedMentions, { parse: [] });
  });
});

test("all-time conflicts with any specific season, including zero, before API requests", async () => {
  for (const season of [0, 9.5]) {
    await withRankApi(async (state, execute) => {
      await execute(season, true);
      assert.equal(state.requests.length, 0);
      assert.match(state.payloads[0], /Choose either a season or all-time/);
    });
  }
});

test("all-time false preserves selected-season behavior", async () => {
  await withRankApi(async (state, execute) => {
    await execute(9.5, false);
    assert.equal(state.requests[2].searchParams.get("season"), "312");
    assert.equal(fieldValue(state.payloads[0].embeds[0], "Season rank"), "Gold I");
  });
});

test("a selected season keeps PC and console rank entries separate", async () => {
  await withRankApi(async (state, execute) => {
    state.history.push({ ...state.history[0], device_type: "ps", rank: "Bronze I" });
    await execute(9.5);
    const embeds = state.payloads[0].embeds;
    assert.equal(embeds.length, 2);
    assert.equal(fieldValue(embeds[0], "Platform"), "PC");
    assert.equal(fieldValue(embeds[0], "Season rank"), "Gold I");
    assert.equal(fieldValue(embeds[1], "Platform"), "PS");
    assert.equal(fieldValue(embeds[1], "Season rank"), "Bronze I");
  });
});

test("empty selected-season or all-time history explains availability without falling back to profile rank", async () => {
  for (const [season, allTime] of [[9.5, false], [null, true]]) {
    await withRankApi(async (state, execute) => {
      state.history = [];
      await execute(season, allTime);
      assert.match(state.payloads[0], /No rank history is available/);
      assert.ok(state.requests.every((url) => !url.pathname.endsWith("/career")));
    });
  }
});

test("rank-history failures propagate without silently displaying the latest profile rank", async () => {
  await withRankApi(async (state, execute) => {
    const normalResponse = state.respond;
    state.respond = async (url) => url.pathname.endsWith("/rank-history")
      ? new Response(null, { status: 503 })
      : normalResponse(url);
    await assert.rejects(execute(9.5), /HTTP status 503/);
    assert.equal(state.payloads.length, 0);
    assert.ok(state.requests.every((url) => !url.pathname.endsWith("/career")));
  });
});

for (const [selection, season, allTime] of [["seasonal", 9.5, false], ["all-time", null, true]]) {
  test(`denied ${selection} rank history replies with the Premium access explanation`, async () => {
    await withRankApi(async (state, execute) => {
      const normalResponse = state.respond;
      state.respond = async (url) => url.pathname.endsWith("/rank-history")
        ? new Response("Private upstream details", { status: 403 })
        : normalResponse(url);

      await execute(season, allTime);

      assert.deepEqual(state.payloads, ["Seasonal and all-time ranks require API Premium access."]);
      assert.ok(state.requests.every((url) => !url.pathname.endsWith("/career")));
    });
  });
}

test("access denied during username lookup or regular rank lookup is not labeled as a Premium history failure", async () => {
  for (const deniedPath of ["/players/search", `/players/${player.uid}/career`]) {
    await withRankApi(async (state, execute) => {
      const normalResponse = state.respond;
      state.respond = async (url) => url.pathname === deniedPath
        ? new Response(null, { status: 403 })
        : normalResponse(url);

      await assert.rejects(execute(), (error) => error.status === 403 && /Access denied/.test(error.message));
      assert.equal(state.payloads.length, 0);
    });
  }
});

test("invalid API keys and insufficient credits are not labeled as Premium history failures", async () => {
  for (const [status, message] of [[401, /API key is missing or invalid/], [402, /insufficient credits/]]) {
    await withRankApi(async (state, execute) => {
      const normalResponse = state.respond;
      state.respond = async (url) => url.pathname.endsWith("/rank-history")
        ? new Response(null, { status })
        : normalResponse(url);

      await assert.rejects(execute(null, true), message);
      assert.equal(state.payloads.length, 0);
    });
  }
});
