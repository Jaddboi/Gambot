// Checks that the current Discord reply API still produces the expected latency values.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadCommand } = require("./helpers/load-command.cjs");

test("ping calculates latency from the returned message and gateway ping", async () => {
  let replyOptions;
  let editedReply;
  await loadCommand("ping").execute({
    createdTimestamp: 1000,
    client: { ws: { ping: 12.6 } },
    reply: async (options) => {
      replyOptions = options;
      return { resource: { message: { createdTimestamp: 1042 } } };
    },
    editReply: async (content) => { editedReply = content; },
  });
  assert.equal(replyOptions.withResponse, true);
  assert.match(editedReply, /Bot Latency: 42ms/);
  assert.match(editedReply, /API Latency: 13ms/);
});
