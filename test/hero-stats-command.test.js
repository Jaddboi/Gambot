// Tests hero-stat command registration, selection, replies, and navigation with an isolated fake API.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { ApplicationCommandOptionType } = require("discord.js");
const { loadCommand } = require("./helpers/load-command.cjs");
const { withMockFetch } = require("./helpers/mock-fetch.cjs");
const fixture = require("./fixtures/hero-stats.json");

const apiKey = "dummy-key";
const baseUrl = "https://hero-command.example";
const seasons = [{ id: 301, number: "0" }, { id: 307, number: "9" }, { id: 312, number: "9.5" }];

async function withHeroCommand(check) {
  const state = {
    requests: [],
    payloads: [],
    deferred: false,
    collector: new EventEmitter(),
    respond: async (url) => {
      if (url.pathname === "/heroes") return Response.json({ heroes: [fixture.hero] });
      if (url.pathname === "/seasons") return Response.json({ seasons });
      if (url.pathname === "/players/search") return Response.json({ player: fixture.player });
      assert.equal(url.pathname, `/players/${fixture.player.uid}/heroes/${fixture.hero.id}`);
      return Response.json({ ...fixture, filters: {
        season: url.searchParams.has("season") ? Number(url.searchParams.get("season")) : null,
        game_mode: url.searchParams.has("game_mode") ? Number(url.searchParams.get("game_mode")) : null,
      } });
    },
  };
  const command = loadCommand("hero-stats", { apiKey, baseUrl });
  const message = { createMessageComponentCollector: (options) => {
    assert.equal(options.time, 120_000);
    state.hasCollector = true;
    return state.collector;
  } };
  async function execute({ hero = "Spider-Man", player = fixture.player.name, season = null, mode = null } = {}) {
    state.deferred = false;
    await command.execute({
      user: { id: "owner" },
      options: {
        getString: (name, required) => {
          assert.equal(required, true);
          assert.ok(["hero", "player"].includes(name));
          return name === "hero" ? hero : player;
        },
        getNumber: (name) => { assert.equal(name, "season"); return season; },
        getInteger: (name) => { assert.equal(name, "mode"); return mode; },
      },
      deferReply: async () => { state.deferred = true; },
      editReply: async (payload) => {
        assert.ok(state.deferred, "Reply only after acknowledging the command");
        state.payloads.push(payload);
        return message;
      },
    });
  }
  await withMockFetch(async (input, options) => {
    assert.ok(state.deferred, "Defer before any API request");
    const url = new URL(input);
    state.requests.push(url);
    assert.equal(url.origin, baseUrl);
    assert.equal(options.headers["x-api-key"], apiKey);
    return state.respond(url);
  }, () => check(state, execute));
}

test("hero-stats registers required hero/player names, decimal seasons, and mode choices", () => {
  const definition = loadCommand("hero-stats").data.toJSON();
  assert.equal(definition.name, "hero-stats");
  const [hero, player, season, mode] = definition.options;
  assert.equal(hero.name, "hero");
  assert.equal(player.name, "player");
  for (const option of [hero, player]) {
    assert.equal(option.type, ApplicationCommandOptionType.String);
    assert.equal(option.required, true);
  }
  assert.equal(season.name, "season");
  assert.equal(season.type, ApplicationCommandOptionType.Number);
  assert.equal(season.min_value, 0);
  assert.equal(season.required, false);
  assert.equal(mode.name, "mode");
  assert.equal(mode.type, ApplicationCommandOptionType.Integer);
  assert.deepEqual(mode.choices.map((choice) => choice.value), [1, 2]);
});

test("hero-stats resolves the hero, searches the player, and shows the overview without proficiency requests", async () => {
  await withHeroCommand(async (state, execute) => {
    await execute({ hero: "spiderman" });
    assert.deepEqual(state.requests.map((url) => url.pathname), [
      "/heroes", "/players/search", `/players/${fixture.player.uid}/heroes/${fixture.hero.id}`,
    ]);
    assert.equal(state.requests[2].search, "");
    const payload = state.payloads[0];
    assert.equal(payload.embeds[0].title, "CampusPlayer — SPIDER-MAN — Overview");
    assert.equal(payload.embeds[0].fields.find((field) => field.name === "Matches").value, "12.5");
    assert.equal(payload.embeds[0].fields.find((field) => field.name === "Wins").value, "8.25");
    assert.match(payload.embeds[0].description, /API default season • API default mode/);
    assert.equal(payload.embeds[0].thumbnail.url, fixture.hero.icon);
    assert.equal(JSON.stringify(payload.allowedMentions), '{"parse":[]}');
    assert.equal(state.hasCollector, true);
  });
});

test("hero-stats translates whole, half, and zero seasons and sends the chosen mode", async () => {
  for (const season of seasons) {
    for (const mode of [1, 2]) {
      await withHeroCommand(async (state, execute) => {
        await execute({ season: Number(season.number), mode });
        const request = state.requests.at(-1);
        assert.equal(request.searchParams.get("season"), String(season.id));
        assert.equal(request.searchParams.get("game_mode"), String(mode));
        const description = state.payloads[0].embeds[0].description;
        assert.ok(description.includes(`Season ${season.number}`));
        assert.ok(description.includes(mode === 1 ? "Quick Play" : "Competitive"));
      });
    }
  }
});

test("unknown and incomplete heroes explain the full name without spending player-stat requests", async () => {
  for (const name of ["Spider", "not-a-hero", " --- "]) {
    await withHeroCommand(async (state, execute) => {
      await execute({ hero: name });
      assert.ok(state.requests.every((url) => url.pathname === "/heroes"));
      const payload = state.payloads[0];
      assert.match(payload.content, /No unique hero matched that name/);
      if (name === "Spider") assert.match(payload.content, /Try a full name: SPIDER-MAN/);
      assert.equal(JSON.stringify(payload.allowedMentions), '{"parse":[]}');
      assert.equal(state.hasCollector, undefined);
    });
  }
});

test("unavailable seasons stop before player search and hero stats", async () => {
  for (const season of [0.5, 9.25, 999]) {
    await withHeroCommand(async (state, execute) => {
      await execute({ season });
      assert.deepEqual(state.requests.map((url) => url.pathname), ["/heroes", "/seasons"]);
      assert.match(state.payloads[0], /That season is unavailable/);
    });
  }
});

test("missing players and unavailable hero stats get specific explanations", async () => {
  for (const failure of ["null-player", "search-404", "stats-404"]) {
    await withHeroCommand(async (state, execute) => {
      const originalRespond = state.respond;
      state.respond = async (url) => {
        if (url.pathname === "/players/search") {
          if (failure === "null-player") return Response.json({ player: null });
          if (failure === "search-404") return new Response(null, { status: 404 });
        }
        if (failure === "stats-404" && url.pathname.endsWith(`/heroes/${fixture.hero.id}`)) {
          return new Response("Private upstream details", { status: 404 });
        }
        return originalRespond(url);
      };
      await execute();
      assert.equal(state.payloads.length, 1);
      assert.match(state.payloads[0], failure === "stats-404" ? /Hero stats are unavailable/ : /No player was found/);
    });
  }
});

test("zero hero matches produce a single honest overview without navigation controls", async () => {
  await withHeroCommand(async (state, execute) => {
    const originalRespond = state.respond;
    state.respond = async (url) => url.pathname.endsWith(`/heroes/${fixture.hero.id}`)
      ? Response.json({ ...fixture, career: { matches: 0, wins: 0 } })
      : originalRespond(url);
    await execute();
    const payload = state.payloads[0];
    assert.match(payload.embeds[0].description, /No matches were reported for this hero and selection/);
    assert.equal(payload.embeds[0].fields.find((field) => field.name === "Matches").value, "0");
    assert.equal(JSON.stringify(payload.components), "[]");
    assert.equal(state.hasCollector, undefined);
  });
});

test("owner navigation changes hero pages and reuses the fetched stats", async () => {
  await withHeroCommand(async (state, execute) => {
    await execute();
    const count = state.requests.length;
    let acknowledged = 0;
    const next = () => state.collector.emit("collect", {
      customId: "gambot:pages:next",
      user: { id: "owner" },
      deferUpdate: async () => { acknowledged++; },
    });
    next();
    await new Promise((resolve) => setImmediate(resolve));
    assert.match(state.payloads.at(-1).embeds[0].title, /Impact$/);
    next();
    await new Promise((resolve) => setImmediate(resolve));
    assert.match(state.payloads.at(-1).embeds[0].title, /Personal Bests$/);
    assert.equal(state.payloads.at(-1).content, "Page 3 / 3");
    assert.equal(acknowledged, 2);
    assert.equal(state.requests.length, count);
  });
});

test("API failures propagate without claiming hero career stats need Premium", async () => {
  for (const status of [401, 402, 403, 429, 503]) {
    await withHeroCommand(async (state, execute) => {
      const originalRespond = state.respond;
      state.respond = async (url) => url.pathname.endsWith(`/heroes/${fixture.hero.id}`)
        ? new Response("Private upstream details", { status })
        : originalRespond(url);
      await assert.rejects(execute(), (error) => {
        assert.equal(error.message.includes("Private upstream details"), false);
        assert.equal(error.message.includes("Premium"), false);
        return true;
      });
      assert.equal(state.payloads.length, 0);
    });
  }
});
