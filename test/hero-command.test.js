// Tests /hero info registration, lookups, replies, and biography navigation with an isolated mock API.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { ApplicationCommandOptionType, MessageFlags } = require("discord.js");
const { loadCommand } = require("./helpers/load-command.cjs");
const { withMockFetch } = require("./helpers/mock-fetch.cjs");
const fixture = require("./fixtures/hero-details.json");

const apiKey = "dummy-key";
const baseUrl = "https://hero-command.example";
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

async function withHeroCommand(check) {
  const state = {
    requests: [], payloads: [], deferred: false, collector: new EventEmitter(),
    respond: async (url) => {
      if (url.pathname === "/heroes") return Response.json({ heroes: [fixture] });
      assert.equal(url.pathname, `/heroes/${fixture.id}`);
      return Response.json(fixture);
    },
  };
  const command = loadCommand("hero", { apiKey, baseUrl });
  async function execute(name = "Spider-Man") {
    state.deferred = false;
    await command.execute({
      user: { id: "owner" },
      options: { getString: (key, required) => {
        assert.ok(state.deferred, "Acknowledge before reading options or calling the API");
        assert.equal(key, "name");
        assert.equal(required, true);
        return name;
      } },
      deferReply: async () => { state.deferred = true; },
      editReply: async (payload) => {
        state.payloads.push(payload);
        return { createMessageComponentCollector: (options) => {
          assert.equal(options.time, 120_000);
          state.hasCollector = true;
          return state.collector;
        } };
      },
    });
  }
  await withMockFetch(async (input, options) => {
    assert.ok(state.deferred);
    const url = new URL(input);
    assert.equal(url.origin, baseUrl);
    assert.equal(options.headers["x-api-key"], apiKey);
    state.requests.push(url);
    return state.respond(url);
  }, () => check(state, execute));
}

test("hero registers an info subcommand with a required full-name option", () => {
  const definition = loadCommand("hero").data.toJSON();
  assert.equal(definition.name, "hero");
  assert.equal(definition.options.length, 1);
  const info = definition.options[0];
  assert.equal(info.name, "info");
  assert.equal(info.type, ApplicationCommandOptionType.Subcommand);
  assert.equal(info.options.length, 1);
  const option = info.options[0];
  assert.equal(option.name, "name");
  assert.equal(option.type, ApplicationCommandOptionType.String);
  assert.equal(option.required, true);
  assert.equal(option.min_length, 1);
  assert.equal(option.max_length, 100);
});

test("hero info resolves the name and fetches details without player or image requests", async () => {
  await withHeroCommand(async (state, execute) => {
    await execute("spiderman");
    assert.deepEqual(state.requests.map((url) => url.pathname), ["/heroes", `/heroes/${fixture.id}`]);
    const payload = state.payloads[0];
    assert.equal(payload.embeds[0].title, "SPIDER-MAN — Hero Info");
    assert.equal(payload.embeds[0].thumbnail.url, fixture.icon);
    assert.equal(payload.embeds[0].fields.find((field) => field.name === "Role").value, "Duelist");
    assert.equal(JSON.stringify(payload.allowedMentions), '{"parse":[]}');
    assert.equal(payload.components[0].components[1].data.label, "1 / 2");
  });
});

test("biography navigation belongs to the invoking user and reuses the downloaded details", async () => {
  await withHeroCommand(async (state, execute) => {
    await execute();
    const requests = state.requests.length;
    let privateReply;
    state.collector.emit("collect", {
      customId: "gambot:pages:next", user: { id: "someone-else" },
      reply: async (payload) => { privateReply = payload; },
    });
    await nextTurn();
    assert.equal(privateReply.flags, MessageFlags.Ephemeral);
    assert.equal(state.payloads.length, 1);
    state.collector.emit("collect", {
      customId: "gambot:pages:next", user: { id: "owner" }, deferUpdate: async () => {},
    });
    await nextTurn();
    assert.equal(state.payloads.at(-1).embeds[0].title, "SPIDER-MAN — Biography");
    assert.equal(state.payloads.at(-1).content, "Page 2 / 2");
    assert.equal(state.requests.length, requests);
  });
});

test("unknown or incomplete hero names stop before the detail lookup", async () => {
  for (const name of ["Spider", "unknown hero", "---"]) {
    await withHeroCommand(async (state, execute) => {
      await execute(name);
      assert.ok(state.requests.every((url) => url.pathname === "/heroes"));
      assert.match(state.payloads[0].content, /No unique hero matched that name/);
      if (name === "Spider") assert.match(state.payloads[0].content, /Try a full name: SPIDER-MAN/);
      assert.equal(JSON.stringify(state.payloads[0].allowedMentions), '{"parse":[]}');
    });
  }
});

test("an unavailable hero detail response gets a specific explanation", async () => {
  await withHeroCommand(async (state, execute) => {
    const respond = state.respond;
    state.respond = async (url) => url.pathname === "/heroes"
      ? respond(url) : new Response("Private upstream details", { status: 404 });
    await execute();
    assert.equal(state.payloads.length, 1);
    assert.match(state.payloads[0], /Details for this hero are unavailable/);
  });
});

test("a hero without a biography shows a single overview without buttons", async () => {
  await withHeroCommand(async (state, execute) => {
    const respond = state.respond;
    state.respond = async (url) => url.pathname === "/heroes"
      ? respond(url) : Response.json({ ...fixture, biography: null });
    await execute();
    assert.equal(JSON.stringify(state.payloads[0].components), "[]");
    assert.equal(state.hasCollector, undefined);
  });
});

test("repeated hero info commands reuse both catalog and detail caches", async () => {
  await withHeroCommand(async (state, execute) => {
    await execute();
    await execute("SPIDER MAN");
    assert.equal(state.requests.length, 2);
    assert.equal(state.payloads.length, 2);
  });
});

test("API failures and long rate limits propagate safely without a partial hero card", async () => {
  for (const status of [401, 402, 403, 429, 503]) {
    await withHeroCommand(async (state, execute) => {
      const respond = state.respond;
      state.respond = async (url) => url.pathname === "/heroes"
        ? respond(url)
        : new Response("Private upstream details", { status, headers: { "Retry-After": "60" } });
      await assert.rejects(execute(), (error) => {
        assert.equal(error.message.includes("Private upstream details"), false);
        if (status === 429) assert.equal(error.status, 429);
        return true;
      });
      assert.equal(state.payloads.length, 0);
    });
  }
});
