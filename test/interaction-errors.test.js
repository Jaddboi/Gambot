// Tests safe error replies and expired interaction handling without Discord or live configuration.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { MessageFlags } = require("discord.js");
const { handleInteraction } = require("../lib/discord/handle-interaction");
const { loadCommand } = require("./helpers/load-command.cjs");
const { withMockFetch } = require("./helpers/mock-fetch.cjs");

async function handleFailure(t, error, state = {}) {
  const calls = [];
  const logs = [];
  t.mock.method(console, "error", (...values) => logs.push(values));
  const interaction = {
    commandName: "compare", user: { id: t.name }, isChatInputCommand: () => true,
    replied: false, deferred: false, ...state,
    reply: async (payload) => calls.push({ method: "reply", payload }),
    editReply: async (payload) => calls.push({ method: "editReply", payload }),
    followUp: async (payload) => calls.push({ method: "followUp", payload }),
  };
  await handleInteraction(interaction, new Map([["compare", { execute: async () => { throw error; } }]]));
  return { calls, logs };
}

test("an expired initial acknowledgment stops without another reply or any API work", async (t) => {
  const logs = [];
  t.mock.method(console, "error", (...values) => logs.push(values));
  const error = Object.assign(new Error("Unknown interaction"), { code: 10062, url: "https://discord.example/private-token" });
  const interaction = {
    commandName: "compare", user: { id: t.name }, isChatInputCommand: () => true,
    deferReply: async () => { throw error; },
    options: { getString: () => assert.fail("Acknowledge before reading options") },
    reply: async () => assert.fail("Cannot reply to an invalid interaction"),
    editReply: async () => assert.fail("Cannot edit an invalid interaction"),
    followUp: async () => assert.fail("Cannot follow up an invalid interaction"),
  };
  await withMockFetch(async () => assert.fail("No API work after acknowledgment failure"), async () => {
    await handleInteraction(interaction, new Map([["compare", loadCommand("compare")]]));
  });
  assert.match(JSON.stringify(logs), /10062/);
  assert.doesNotMatch(JSON.stringify(logs), /private-token/);
});

test("persistent API limits display a wait time in the deferred reply", async (t) => {
  t.mock.method(Date, "now", () => 1000);
  const error = Object.assign(new Error("Too many requests."), { status: 429, retryAt: 2500 });
  const { calls } = await handleFailure(t, error, { deferred: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "editReply");
  assert.match(calls[0].payload.content, /Marvel Rivals API rate limit/);
  assert.match(calls[0].payload.content, /wait 2 seconds/);
});

test("an elapsed API deadline gives a clear retry message without a negative wait", async (t) => {
  const error = Object.assign(new Error("Too many requests."), { status: 429, retryAt: Date.now() - 1000 });
  const { calls } = await handleFailure(t, error);
  assert.match(calls[0].payload.content, /try again shortly/);
  assert.equal(calls[0].payload.flags, MessageFlags.Ephemeral);
});

test("unexpected failures retain a generic reply and log no error-object callback URLs", async (t) => {
  const error = Object.assign(new Error("Example failure"), { url: "https://discord.example/private-token", requestBody: { token: "private-token" } });
  const { calls, logs } = await handleFailure(t, error, { replied: true });
  assert.equal(calls[0].method, "followUp");
  assert.equal(calls[0].payload.flags, MessageFlags.Ephemeral);
  assert.equal(calls[0].payload.content, "There was an error while executing this command!");
  assert.match(JSON.stringify(logs), /Example failure/);
  assert.doesNotMatch(JSON.stringify(logs), /private-token/);
});

test("a Discord rate error without API metadata is not mislabeled as a Marvel Rivals limit", async (t) => {
  const { calls } = await handleFailure(t, Object.assign(new Error("Discord rate limit"), { status: 429 }));
  assert.equal(calls[0].payload.content, "There was an error while executing this command!");
});
