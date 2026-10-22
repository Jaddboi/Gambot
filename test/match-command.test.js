// Tests standalone match lookups and replies using isolated dummy configuration and mocked requests.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ApplicationCommandOptionType } = require("discord.js");
const { loadCommand } = require("./helpers/load-command.cjs");
const { withMockFetch } = require("./helpers/mock-fetch.cjs");
const fixture = require("./fixtures/match-details.json");

const apiKey = "dummy-key";
const baseUrl = "https://match-command.example";
const player = { uid: "123456789", name: "CampusPlayer" };

async function withMatchApi(check) {
  const state = {
    requests: [],
    payloads: [],
    deferred: false,
    player: { ...player },
    details: structuredClone(fixture),
    searchStatus: 200,
    matchStatus: 200,
  };
  const command = loadCommand("match", { apiKey, baseUrl });

  async function execute(matchUid = fixture.match_uid, username = player.name) {
    state.deferred = false;
    await command.execute({
      options: {
        getString: (name, required) => {
          assert.equal(required, true);
          assert.ok(["player", "match-id"].includes(name));
          return name === "player" ? username : matchUid;
        },
      },
      deferReply: async () => { state.deferred = true; },
      reply: async () => assert.fail("Complete the deferred reply with editReply"),
      editReply: async (payload) => {
        assert.ok(state.deferred);
        state.payloads.push(payload);
        return { createMessageComponentCollector: () => assert.fail("A single match needs no pagination") };
      },
    });
  }

  await withMockFetch(async (input, options) => {
    assert.ok(state.deferred, "Acknowledge before making any requests");
    const url = new URL(input);
    state.requests.push(url);
    assert.equal(url.origin, baseUrl);
    assert.equal(options.headers["x-api-key"], apiKey);
    if (url.pathname === "/players/search") {
      return state.searchStatus === 200
        ? Response.json({ player: state.player })
        : new Response("Private upstream details", { status: state.searchStatus });
    }
    assert.equal(url.pathname, `/matches/${fixture.match_uid}`);
    return state.matchStatus === 200
      ? Response.json(state.details)
      : new Response("Private upstream details", { status: state.matchStatus });
  }, () => check(state, execute));
}

test("match registers a required username and full string match ID", () => {
  const definition = loadCommand("match").data.toJSON();
  assert.equal(definition.name, "match");
  assert.equal(definition.options.length, 2);
  for (const name of ["player", "match-id"]) {
    const option = definition.options.find((entry) => entry.name === name);
    assert.equal(option.type, ApplicationCommandOptionType.String);
    assert.equal(option.required, true);
  }
});

test("match defers, looks up the username and exact match, and replies with a standalone scoreboard", async () => {
  await withMatchApi(async (state, execute) => {
    await execute();
    assert.deepEqual(state.requests.map((url) => url.pathname), [
      "/players/search", `/matches/${fixture.match_uid}`,
    ]);
    assert.equal(state.requests[0].searchParams.get("name"), player.name);
    assert.equal(state.payloads.length, 1);
    const payload = state.payloads[0];
    assert.equal(payload.embeds.length, 2);
    assert.equal(payload.embeds[0].title, "CampusPlayer — Match Details");
    assert.equal(payload.embeds[0].fields.find((field) => field.name === "Kills").value, "22");
    assert.match(payload.embeds[0].footer.text, /^UID: 123456789/);
    assert.equal(payload.embeds[0].footer.text.includes("Match 1 / 1"), false);
    assert.equal(payload.embeds[1].image.url, "attachment://match-scoreboard.png");
    assert.equal(payload.files.length, 1);
    assert.equal(payload.files[0].name, "match-scoreboard.png");
    assert.equal(payload.files[0].attachment.subarray(1, 4).toString(), "PNG");
    assert.equal(JSON.stringify(payload.components), "[]");
    assert.equal(JSON.stringify(payload.allowedMentions), '{"parse":[]}');
    assert.equal(JSON.stringify(payload.attachments), "[]");
  });
});

test("match trims surrounding whitespace without changing a valid composite ID", async () => {
  await withMatchApi(async (state, execute) => {
    await execute(`  ${fixture.match_uid}\n`);
    assert.equal(state.requests[1].pathname, `/matches/${fixture.match_uid}`);
    assert.equal(state.payloads[0].files.length, 1);
  });
});

test("short replay codes and malformed IDs are explained before spending API requests", async () => {
  for (const id of ["10891511996", "", "../123", "1_2_3_4", `${fixture.match_uid}?extra=1`, "1".repeat(161)]) {
    await withMatchApi(async (state, execute) => {
      await execute(id);
      assert.equal(state.requests.length, 0);
      assert.equal(state.payloads.length, 1);
      assert.match(state.payloads[0], /full match ID shown by \/history/);
      assert.match(state.payloads[0], /Short replay codes are not supported/);
    });
  }
});

test("a missing username result stops before match lookup and explains the missing player", async () => {
  await withMatchApi(async (state, execute) => {
    state.player = null;
    await execute();
    assert.equal(state.requests.length, 1);
    assert.equal(state.payloads[0], "No player was found with that username.");
  });
});

test("a search HTTP 404 reports a missing player without a match request", async () => {
  await withMatchApi(async (state, execute) => {
    state.searchStatus = 404;
    await execute();
    assert.equal(state.requests.length, 1);
    assert.equal(state.payloads[0], "No player was found with that username.");
  });
});

test("a match HTTP 404 explains that the match could not be found", async () => {
  await withMatchApi(async (state, execute) => {
    state.matchStatus = 404;
    await execute();
    assert.equal(state.requests.length, 2);
    assert.match(state.payloads[0], /That match could not be found/);
    assert.equal(state.payloads[0].includes("Private upstream details"), false);
  });
});

test("a player who did not participate gets an explanation instead of another player's scoreboard", async () => {
  await withMatchApi(async (state, execute) => {
    state.player = { uid: "987654321", name: "Other Player" };
    await execute();
    assert.equal(state.requests.length, 2);
    assert.equal(state.payloads.length, 1);
    assert.match(state.payloads[0], /That player was not found in this match/);
  });
});

test("the selected player's match UID is checked rather than assuming a name match is enough", async () => {
  await withMatchApi(async (state, execute) => {
    state.player = { uid: "987654321", name: player.name };
    await execute();
    assert.match(state.payloads[0], /That player was not found in this match/);
  });
});

test("repeated match lookups reuse the existing match-detail cache", async () => {
  await withMatchApi(async (state, execute) => {
    await execute();
    await execute();
    assert.equal(state.requests.filter((url) => url.pathname.startsWith("/matches/")).length, 1);
    assert.equal(state.requests.filter((url) => url.pathname === "/players/search").length, 2);
    assert.equal(state.payloads.length, 2);
    assert.ok(state.payloads.every((payload) => payload.embeds[0].title.endsWith("Match Details")));
  });
});

test("API access, credit, rate-limit, and service failures propagate to the existing interaction handler", async () => {
  for (const status of [401, 402, 403, 429, 503]) {
    await withMatchApi(async (state, execute) => {
      state.matchStatus = status;
      await assert.rejects(execute(), (error) => {
        assert.equal(error.message.includes("Private upstream details"), false);
        return true;
      });
      assert.equal(state.payloads.length, 0);
    });
  }
});

test("malformed match responses cannot produce a scoreboard", async () => {
  await withMatchApi(async (state, execute) => {
    state.details.match_uid = "different-match";
    await assert.rejects(execute(), /invalid match details/);
    assert.equal(state.payloads.length, 0);
  });
});
