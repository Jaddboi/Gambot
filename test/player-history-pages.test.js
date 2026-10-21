// Tests history card content and unavailable values without credentials or network requests.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildPlayerHistoryPages } = require("../lib/embeds/build-player-history-pages");

const player = { uid: "123456789", name: "Dummy Player" };
const match = {
  match_uid: "dummy-match", result: "win", played_at: "2026-10-21T12:00:00Z",
  map: { name: "Test Map" }, game_mode: "Competitive",
  player: { kills: 10, deaths: 0, assists: 5, rank: { change: 25 } },
};
const fieldValue = (page, name) => page.fields.find((field) => field.name === name).value;
const render = (entry) => buildPlayerHistoryPages(player, { matches: [entry] })[0].toJSON();

test("history cards preserve match order, fields, timestamps, and numbering without mutating input", () => {
  const history = { matches: [match, { ...match, result: "loss" }] };
  const before = JSON.stringify(history);
  const pages = buildPlayerHistoryPages(player, history).map((page) => page.toJSON());
  assert.equal(pages.length, 2);
  assert.equal(pages[0].title, "Dummy Player — Match History");
  assert.equal(pages[0].description, "Result: **win**");
  assert.equal(pages[1].description, "Result: **loss**");
  assert.deepEqual(pages[0].fields.map((field) => field.name), ["Map", "Mode", "Rank change", "Kills", "Deaths", "Assists"]);
  assert.equal(fieldValue(pages[0], "Map"), "Test Map");
  assert.equal(fieldValue(pages[0], "Mode"), "Competitive");
  assert.equal(pages[0].timestamp, "2026-10-21T12:00:00.000Z");
  assert.equal(pages[1].footer.text, `Match 2 / 2 • UID: ${player.uid}`);
  assert.equal(JSON.stringify(history), before);
});

test("history cards preserve zero counts and distinguish invalid or missing counts", () => {
  for (const [count, expected] of [[0, "0"], [1200, "1,200"], [null, "Unavailable"], [undefined, "Unavailable"], [-1, "Unavailable"], ["5", "Unavailable"], [NaN, "Unavailable"], [Infinity, "Unavailable"]]) {
    const page = render({ ...match, player: { kills: count, deaths: count, assists: count } });
    for (const name of ["Kills", "Deaths", "Assists"]) assert.equal(fieldValue(page, name), expected);
  }
  const missing = render({ ...match, player: null });
  for (const name of ["Kills", "Deaths", "Assists", "Rank change"]) assert.equal(fieldValue(missing, name), "Unavailable");
});

test("rank changes show signed gains, losses, zero, and unavailable data", () => {
  for (const [change, expected] of [[25, "+25"], [-20, "-20"], [0, "0"], [null, "Unavailable"], [undefined, "Unavailable"], ["25", "Unavailable"], [NaN, "Unavailable"], [Infinity, "Unavailable"]]) {
    const page = render({ ...match, player: { rank: { change } } });
    assert.equal(fieldValue(page, "Rank change"), expected);
  }
});

test("history text escapes Markdown, handles blanks, and fits Discord embed limits", () => {
  const [escaped] = buildPlayerHistoryPages({ ...player, name: "**Player**" }, {
    matches: [{ ...match, map: { name: "*Map*" }, game_mode: " " }],
  });
  assert.equal(escaped.toJSON().title, "\\*\\*Player\\*\\* — Match History");
  assert.equal(fieldValue(escaped.toJSON(), "Map"), "\\*Map\\*");
  assert.equal(fieldValue(escaped.toJSON(), "Mode"), "Unavailable");
  assert.equal(fieldValue(render({ ...match, map: null }), "Map"), "Unavailable");

  const [long] = buildPlayerHistoryPages({ ...player, name: "*".repeat(1000) }, {
    matches: [{ ...match, map: { name: "*".repeat(2000) }, game_mode: "x".repeat(2000) }],
  });
  const data = long.toJSON();
  assert.ok(data.title.length <= 256);
  assert.ok(data.description.length <= 4096);
  assert.ok(data.fields.every((field) => field.value.length > 0 && field.value.length <= 1024));
});

test("empty history returns a single explanation page without claiming all history is empty", () => {
  const pages = buildPlayerHistoryPages(player, { matches: [] });
  assert.equal(pages.length, 1);
  assert.equal(pages[0].toJSON().title, "Dummy Player — Match History");
  assert.equal(pages[0].toJSON().description, "No matches were returned for this page.");
});
