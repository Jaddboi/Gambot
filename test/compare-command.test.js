// Tests comparison lookups, shared filters, failures, cache reuse, and navigation using dummy settings.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { ApplicationCommandOptionType } = require("discord.js");
const { loadCommand } = require("./helpers/load-command.cjs");
const { withMockFetch } = require("./helpers/mock-fetch.cjs");
const fixture = require("./fixtures/hero-stats.json");

const apiKey = "dummy-key";
const baseUrl = "https://compare-command.example";
const players = [fixture.player, { uid: "987654321", name: "OtherPlayer" }];
const seasons = [{ id: 301, number: "0" }, { id: 307, number: "9" }, { id: 312, number: "9.5" }];
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

async function withCompareCommand(check) {
  const state = {
    requests: [], payloads: [], deferred: false, collector: new EventEmitter(),
    respond: async (url) => {
      if (url.pathname === "/heroes") return Response.json({ heroes: [fixture.hero] });
      if (url.pathname === "/seasons") return Response.json({ seasons });
      if (url.pathname === "/players/search") {
        const player = players.find((entry) => entry.name === url.searchParams.get("name")) ?? null;
        return Response.json({ player });
      }
      const match = url.pathname.match(/^\/players\/(\d+)\/(career|heroes\/\d+)$/);
      assert.ok(match, `Unexpected endpoint: ${url.pathname}`);
      const player = players.find((entry) => entry.uid === match[1]);
      assert.ok(player);
      return Response.json({ ...fixture, player, filters: {
        season: url.searchParams.has("season") ? Number(url.searchParams.get("season")) : null,
        game_mode: url.searchParams.has("game_mode") ? Number(url.searchParams.get("game_mode")) : null,
        device_type: null,
      } });
    },
  };
  const command = loadCommand("compare", { apiKey, baseUrl });
  async function execute({ playerA = players[0].name, playerB = players[1].name, hero = null, season = null, mode = null } = {}) {
    state.deferred = false;
    await command.execute({
      user: { id: "owner" },
      options: {
        getString: (name, required) => {
          if (name === "hero") return hero;
          assert.equal(required, true);
          assert.ok(["player-a", "player-b"].includes(name));
          return name === "player-a" ? playerA : playerB;
        },
        getNumber: (name) => { assert.equal(name, "season"); return season; },
        getInteger: (name) => { assert.equal(name, "mode"); return mode; },
      },
      deferReply: async () => { state.deferred = true; },
      editReply: async (payload) => {
        assert.ok(state.deferred);
        state.payloads.push(payload);
        return { createMessageComponentCollector: (options) => {
          assert.equal(options.time, 120_000);
          return state.collector;
        } };
      },
    });
  }
  await withMockFetch(async (input, options) => {
    assert.ok(state.deferred, "Acknowledge the command before any API calls");
    const url = new URL(input);
    state.requests.push(url);
    assert.equal(url.origin, baseUrl);
    assert.equal(options.headers["x-api-key"], apiKey);
    return state.respond(url);
  }, () => check(state, execute));
}

const statsRequests = (state) => state.requests.filter((url) => url.pathname !== "/players/search" && url.pathname.startsWith("/players/"));

test("compare registers two required usernames and optional hero, decimal season, and mode", () => {
  const definition = loadCommand("compare").data.toJSON();
  assert.equal(definition.name, "compare");
  assert.deepEqual(definition.options.map((option) => option.name), ["player-a", "player-b", "hero", "season", "mode"]);
  for (const option of definition.options.slice(0, 2)) {
    assert.equal(option.type, ApplicationCommandOptionType.String);
    assert.equal(option.required, true);
  }
  assert.equal(definition.options[2].required, false);
  assert.equal(definition.options[3].type, ApplicationCommandOptionType.Number);
  assert.equal(definition.options[3].min_value, 0);
  assert.deepEqual(definition.options[4].choices.map((choice) => choice.value), [1, 2]);
});

test("default comparison loads two career responses without catalog or Premium requests", async () => {
  await withCompareCommand(async (state, execute) => {
    await execute();
    assert.equal(state.requests.length, 4);
    assert.equal(statsRequests(state).length, 2);
    assert.ok(statsRequests(state).every((url) => url.pathname.endsWith("/career") && url.search === ""));
    const payload = state.payloads[0];
    assert.equal(payload.embeds[0].title, "CampusPlayer vs OtherPlayer — Performance");
    assert.ok(payload.embeds[0].fields[0].value.includes("CampusPlayer:"));
    assert.ok(payload.embeds[0].fields[0].value.includes("OtherPlayer:"));
    assert.match(payload.embeds[0].description, /API default season • API default mode • API default platform/);
    assert.equal(payload.components[0].components[1].data.label, "1 / 3");
    assert.equal(JSON.stringify(payload.allowedMentions), '{"parse":[]}');
  });
});

test("one shared hero/season resolution applies the same selected filters to both players", async () => {
  for (const season of seasons) {
    await withCompareCommand(async (state, execute) => {
      await execute({ hero: "spiderman", season: Number(season.number), mode: 2 });
      assert.equal(state.requests.filter((url) => url.pathname === "/seasons").length, 1);
      assert.equal(state.requests.filter((url) => url.pathname === "/heroes").length, 1);
      const requests = statsRequests(state);
      assert.equal(requests.length, 2);
      for (const request of requests) {
        assert.ok(request.pathname.endsWith(`/heroes/${fixture.hero.id}`));
        assert.equal(request.searchParams.get("season"), String(season.id));
        assert.equal(request.searchParams.get("game_mode"), "2");
      }
      assert.equal(state.payloads[0].embeds[0].thumbnail.url, fixture.hero.icon);
      assert.ok(state.payloads[0].embeds[0].description.includes(`Season ${season.number} • Competitive`));
    });
  }
});

test("overall comparisons also use explicit season and Quick Play filters", async () => {
  await withCompareCommand(async (state, execute) => {
    await execute({ season: 9.5, mode: 1 });
    for (const request of statsRequests(state)) {
      assert.ok(request.pathname.endsWith("/career"));
      assert.equal(request.searchParams.get("season"), "312");
      assert.equal(request.searchParams.get("game_mode"), "1");
    }
    assert.match(state.payloads[0].embeds[0].description, /Season 9\.5 • Quick Play/);
  });
});

test("unavailable seasons and incomplete heroes stop before username or career lookups", async () => {
  for (const selection of [{ season: 0.5 }, { season: 9.25 }, { hero: "Spider" }, { hero: "unknown" }]) {
    await withCompareCommand(async (state, execute) => {
      await execute(selection);
      assert.equal(statsRequests(state).length, 0);
      assert.ok(!state.requests.some((url) => url.pathname === "/players/search"));
      const payload = state.payloads[0];
      if (selection.season != null) assert.match(payload, /That season is unavailable/);
      else assert.match(payload.content, /No unique hero matched that name/);
      if (selection.hero === "Spider") assert.match(payload.content, /SPIDER-MAN/);
    });
  }
});

test("identical names are rejected before requests and duplicate resolved UIDs before stats", async () => {
  await withCompareCommand(async (state, execute) => {
    await execute({ playerB: " campusPLAYER " });
    assert.equal(state.requests.length, 0);
    assert.match(state.payloads[0], /Choose two different players/);
  });
  await withCompareCommand(async (state, execute) => {
    state.respond = async () => Response.json({ player: players[0] });
    await execute();
    assert.equal(statsRequests(state).length, 0);
    assert.match(state.payloads[0].content, /Choose two different players/);
  });
});

test("missing username results name the player without fetching career stats", async () => {
  for (const [index, status] of [[0, 200], [1, 200], [0, 404], [1, 404]]) {
    await withCompareCommand(async (state, execute) => {
      const respond = state.respond;
      state.respond = async (url) => url.pathname === "/players/search" && url.searchParams.get("name") === players[index].name
        ? (status === 404 ? new Response(null, { status }) : Response.json({ player: null }))
        : respond(url);
      await execute();
      assert.equal(state.payloads[0].content, `**${players[index].name}** was not found. Check their Marvel Rivals username.`);
      assert.equal(JSON.stringify(state.payloads[0].allowedMentions), '{"parse":[]}');
      assert.equal(statsRequests(state).length, 0);
    });
  }
});

test("named lookup errors escape Markdown and cannot ping mentions", async () => {
  await withCompareCommand(async (state, execute) => {
    await execute({ playerA: "**@everyone**" });
    assert.ok(state.payloads[0].content.includes("\\*\\*@everyone\\*\\*"));
    assert.equal(JSON.stringify(state.payloads[0].allowedMentions), '{"parse":[]}');
    assert.equal(statsRequests(state).length, 0);
  });
});

test("missing stats explain which player's selection is unavailable", async () => {
  for (const index of [0, 1]) {
    await withCompareCommand(async (state, execute) => {
      const respond = state.respond;
      state.respond = async (url) => url.pathname === `/players/${players[index].uid}/career`
        ? new Response(null, { status: 404 }) : respond(url);
      await execute();
      assert.equal(state.payloads[0].content, `Stats are unavailable for **${players[index].name}** and this selection.`);
    });
  }
});

test("mismatched or unconfirmed default filters never produce comparison highlights", async () => {
  const filters = [
    { season: 307, game_mode: null, device_type: null },
    { season: null, game_mode: 2, device_type: null },
    { season: null, game_mode: null, device_type: "xbox" },
    { season: null, game_mode: null },
    { season: "307", game_mode: null, device_type: null },
    { season: null, game_mode: -1, device_type: null },
  ];
  for (const mismatch of filters) {
    await withCompareCommand(async (state, execute) => {
      const respond = state.respond;
      state.respond = async (url) => url.pathname === `/players/${players[1].uid}/career`
        ? Response.json({ ...fixture, player: players[1], filters: mismatch }) : respond(url);
      await execute();
      assert.equal(state.payloads.length, 1);
      assert.match(state.payloads[0].content, /did not confirm matching season, mode, and platform filters/);
    });
  }
});

test("matching responses must still confirm explicitly requested season and mode", async () => {
  for (const filters of [
    { season: 307, game_mode: 2, device_type: null },
    { season: 312, game_mode: 1, device_type: null },
  ]) {
    await withCompareCommand(async (state, execute) => {
      const respond = state.respond;
      state.respond = async (url) => {
        if (!url.pathname.endsWith("/career")) return respond(url);
        const player = players.find((entry) => url.pathname.includes(entry.uid));
        return Response.json({ ...fixture, player, filters });
      };
      await execute({ season: 9.5, mode: 2 });
      assert.match(state.payloads[0].content, /No comparison was made/);
    });
  }
});

test("comparison lookups run sequentially without overlapping API requests", async () => {
  await withCompareCommand(async (state, execute) => {
    let active = 0;
    let maxActive = 0;
    const respond = state.respond;
    state.respond = async (url) => {
      active++;
      maxActive = Math.max(maxActive, active);
      try {
        await nextTurn();
        return await respond(url);
      } finally {
        active--;
      }
    };
    await execute();
    assert.equal(maxActive, 1);
    assert.deepEqual(state.requests.map((url) => url.pathname), [
      "/players/search", "/players/search", `/players/${players[0].uid}/career`, `/players/${players[1].uid}/career`,
    ]);
  });
});

test("repeated comparisons reuse career caches and navigation makes no new requests", async () => {
  await withCompareCommand(async (state, execute) => {
    await execute();
    const initialRequests = state.requests.length;
    state.collector.emit("collect", {
      customId: "gambot:pages:next", user: { id: "owner" }, deferUpdate: async () => {},
    });
    await nextTurn();
    assert.equal(state.payloads.at(-1).embeds[0].title, "CampusPlayer vs OtherPlayer — Impact");
    assert.equal(state.payloads.at(-1).content, "Page 2 / 3");
    assert.equal(state.requests.length, initialRequests);
    await execute();
    assert.equal(statsRequests(state).length, 2);
    assert.equal(state.requests.filter((url) => url.pathname === "/players/search").length, 4);
  });
});

test("API access, credit, and service failures propagate without partial comparison cards", async () => {
  for (const status of [401, 402, 403, 503]) {
    await withCompareCommand(async (state, execute) => {
      const respond = state.respond;
      state.respond = async (url) => url.pathname.endsWith("/career")
        ? new Response("Private upstream details", { status }) : respond(url);
      await assert.rejects(execute(), (error) => {
        assert.equal(error.message.includes("Private upstream details"), false);
        return true;
      });
      assert.equal(state.payloads.length, 0);
    });
  }
});

test("a rate-limited lookup retries just that operation before continuing the comparison", async () => {
  await withCompareCommand(async (state, execute) => {
    let attempts = 0;
    const respond = state.respond;
    state.respond = async (url) => {
      if (url.pathname === "/players/search" && url.searchParams.get("name") === players[1].name && ++attempts === 1) {
        return new Response(null, { status: 429, headers: { "X-RateLimit-Retry-After-Ms": "2" } });
      }
      return respond(url);
    };
    await execute();
    assert.equal(attempts, 2);
    assert.equal(state.requests.filter((url) => url.pathname === "/players/search" && url.searchParams.get("name") === players[0].name).length, 1);
    assert.equal(state.payloads[0].embeds[0].title, "CampusPlayer vs OtherPlayer — Performance");
  });
});

test("repeated or long rate limits propagate with their deadline and no partial cards", async () => {
  for (const delay of [2, 60000]) {
    await withCompareCommand(async (state, execute) => {
      const respond = state.respond;
      let attempts = 0;
      state.respond = async (url) => {
        if (!url.pathname.endsWith("/career")) return respond(url);
        attempts++;
        return new Response(null, { status: 429, headers: { "X-RateLimit-Retry-After-Ms": String(delay) } });
      };
      await assert.rejects(execute(), (error) => error.status === 429 && Number.isFinite(error.retryAt));
      assert.equal(attempts, delay === 2 ? 2 : 1);
      assert.equal(state.payloads.length, 0);
    });
  }
});
