// Tests message pagination, ownership, and expiry using fake Discord interactions.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { EmbedBuilder, MessageFlags, ComponentType } = require("discord.js");
const { paginateEmbeds } = require("../lib/discord/paginate-embeds");

const flushUpdates = () => new Promise(resolve => setImmediate(resolve));
const buttons = payload => payload.components[0].toJSON().components;

function harness(pageCount = 3) {
  const state = { initial: null, edits: [], collectorOptions: null };
  const collector = new EventEmitter();
  collector.ended = false;
  collector.stop = (reason) => {
    if (collector.ended) return;
    collector.ended = true;
    collector.emit("end", new Map(), reason);
  };
  const message = {
    edit: async () => assert.fail("Pagination must edit the interaction reply, not the channel message"),
    createMessageComponentCollector: options => {
      state.collectorOptions = options;
      return collector;
    },
  };
  const interaction = {
    user: { id: "owner" },
    editReply: async payload => {
      if (state.initial === null) state.initial = payload;
      else state.edits.push(payload);
      return message;
    },
  };
  const pages = Array.from({ length: pageCount }, (_, index) =>
    new EmbedBuilder().setTitle(`Page ${index + 1}`));
  const click = (direction, userId = "owner") => {
    const button = {
      customId: `gambot:pages:${direction}`,
      user: { id: userId },
      acknowledgements: 0,
      replies: [],
      deferUpdate: async () => { button.acknowledgements++; },
      reply: async payload => { button.replies.push(payload); },
    };
    if (!collector.ended && state.collectorOptions.filter(button)) {
      collector.emit("collect", button);
    }
    return button;
  };
  return { state, collector, message, interaction, pages, click };
}

test("initial reply shows the first page and uses a message-scoped button collector", async () => {
  const h = harness();
  await paginateEmbeds(h.interaction, h.pages);
  assert.deepEqual(h.state.initial.embeds[0], h.pages[0].toJSON());
  assert.equal(buttons(h.state.initial)[0].disabled, true);
  assert.equal(buttons(h.state.initial)[1].label, "1 / 3");
  assert.equal(buttons(h.state.initial)[2].disabled, false);
  assert.equal(h.state.collectorOptions.componentType, ComponentType.Button);
  assert.equal(h.state.collectorOptions.time, 120_000);
  assert.equal(h.state.collectorOptions.filter({ customId: "unrelated" }), false);
});

test("owner navigation is ordered, respects boundaries, and updates button states", async () => {
  const h = harness();
  await paginateEmbeds(h.interaction, h.pages);
  const first = h.click("next");
  const second = h.click("next");
  assert.equal(first.acknowledgements, 1);
  assert.equal(second.acknowledgements, 1);
  await flushUpdates();
  assert.deepEqual(h.state.edits[0].embeds[0], h.pages[1].toJSON());
  assert.deepEqual(h.state.edits[1].embeds[0], h.pages[2].toJSON());
  assert.equal(h.state.edits[0].content, "Page 2 / 3");
  assert.equal(buttons(h.state.edits[1])[1].label, "3 / 3");
  assert.equal(buttons(h.state.edits[1])[2].disabled, true);

  h.click("next");
  await flushUpdates();
  assert.deepEqual(h.state.edits.at(-1).embeds[0], h.pages[2].toJSON());
  h.click("previous");
  await flushUpdates();
  assert.deepEqual(h.state.edits.at(-1).embeds[0], h.pages[1].toJSON());
});

test("other users receive an ephemeral reply without changing the page", async () => {
  const h = harness();
  await paginateEmbeds(h.interaction, h.pages);
  const button = h.click("next", "someone-else");
  await flushUpdates();
  assert.equal(button.acknowledgements, 0);
  assert.equal(button.replies.length, 1);
  assert.equal(button.replies[0].flags, MessageFlags.Ephemeral);
  assert.equal(h.state.edits.length, 0);
});

test("separate command messages maintain independent page positions", async () => {
  const first = harness();
  const second = harness();
  await paginateEmbeds(first.interaction, first.pages);
  await paginateEmbeds(second.interaction, second.pages);
  first.click("next");
  await flushUpdates();
  assert.deepEqual(first.state.edits.at(-1).embeds[0], first.pages[1].toJSON());
  assert.equal(second.state.edits.length, 0);
  second.click("next");
  await flushUpdates();
  assert.deepEqual(second.state.edits.at(-1).embeds[0], second.pages[1].toJSON());
});

test("expiry disables controls after outstanding edits have finished", async () => {
  const h = harness();
  await paginateEmbeds(h.interaction, h.pages, 5000);
  assert.equal(h.state.collectorOptions.time, 5000);
  let finishEdit;
  const editGate = new Promise(resolve => { finishEdit = resolve; });
  h.interaction.editReply = async payload => {
    h.state.edits.push(payload);
    if (h.state.edits.length === 1) await editGate;
    return h.message;
  };
  h.click("next");
  await flushUpdates();
  h.collector.stop("time");
  assert.equal(h.state.edits.length, 1);
  finishEdit();
  await flushUpdates();
  assert.equal(h.state.edits.length, 2);
  assert.ok(buttons(h.state.edits[1]).every(button => button.disabled));
  assert.equal(buttons(h.state.edits[1])[1].label, "2 / 3");
});

test("a single page has no controls and an empty page list is rejected", async () => {
  const h = harness(1);
  await paginateEmbeds(h.interaction, h.pages);
  assert.deepEqual(h.state.initial.components, []);
  assert.equal(h.state.collectorOptions, null);
  await assert.rejects(paginateEmbeds(h.interaction, []), /At least one embed/);
});

test("a failed button acknowledgement does not change the page or reject later updates", async () => {
  const h = harness();
  await paginateEmbeds(h.interaction, h.pages);
  h.collector.emit("collect", {
    customId: "gambot:pages:next", user: { id: "owner" },
    deferUpdate: async () => { throw new Error("Simulated failure"); },
  });
  await flushUpdates();
  assert.equal(h.state.edits.length, 0);
  h.click("next");
  await flushUpdates();
  assert.deepEqual(h.state.edits.at(-1).embeds[0], h.pages[1].toJSON());
});

test("lazy pages acknowledge clicks immediately and update the embed and counter only after loading", async () => {
  const h = harness(2);
  let finishLoading;
  let secondLoads = 0;
  const first = h.pages[0].toJSON();
  const second = h.pages[1].toJSON();
  const loaders = [
    async () => ({ embeds: [first] }),
    async () => {
      secondLoads++;
      return new Promise((resolve) => { finishLoading = resolve; });
    },
  ];
  await paginateEmbeds(h.interaction, loaders);
  h.click("next", "someone-else");
  await flushUpdates();
  assert.equal(secondLoads, 0);

  const click = h.click("next");
  assert.equal(click.acknowledgements, 1);
  await flushUpdates();
  assert.equal(secondLoads, 1);
  assert.equal(h.state.edits.length, 0);
  finishLoading({ embeds: [second] });
  await flushUpdates();
  const loaded = h.state.edits[0];
  assert.equal(loaded.content, "Page 2 / 2");
  assert.deepEqual(loaded.embeds[0], second);

  h.collector.stop("time");
  await flushUpdates();
  const expired = h.state.edits.at(-1);
  assert.equal(expired.content, "Page 2 / 2");
  assert.deepEqual(expired.embeds[0], second);
  assert.ok(buttons(expired).every((button) => button.disabled));
});
