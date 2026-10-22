// Tests rendered scoreboard content, image isolation, real PNG output, and text/summary fallbacks.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Resvg } = require("@resvg/resvg-js");
const { buildMatchScoreboardSvg } = require("../lib/rendering/history/build-match-scoreboard-svg");
const { renderMatchScoreboard } = require("../lib/rendering/history/render-match-scoreboard");
const { getScoreboardTeams } = require("../lib/embeds/history/get-scoreboard-teams");
const { createMatchScoreboardMessage } = require("../lib/services/create-match-scoreboard-message");
const { createDetailedHistoryPages } = require("../lib/services/create-detailed-history-pages");
const { withMockFetch } = require("./helpers/mock-fetch.cjs");
const fixture = require("./fixtures/match-details.json");
const player = { uid: "123456789", name: "CampusPlayer" };

test("reference-style tables show after-match ranks, signed RS changes, awards, and selected-player highlighting", () => {
  const data = structuredClone(fixture);
  for (const participant of data.players) {
    participant.rank = { after: { rank: "Grandmaster II", rank_score: 4609, rs: -1 }, change: -20 };
  }
  const { teams } = getScoreboardTeams(data, player.uid);
  const before = JSON.stringify(data);
  const svg = buildMatchScoreboardSvg(teams, player.uid);
  for (const label of ["PLAYER", "RANK", "K / D / A", "FINALS", "DMG", "TAKEN", "HEALING", "ACC",
    "GM2", "-1 RS", "-20", "MVP", "Squirrel Girl", "22 / 6 / 6", "18.6k", "56%", "Avg score 4,609"]) {
    assert.ok(svg.includes(label), `Expected ${label}`);
  }
  assert.ok(svg.includes('fill="#ffd457"'));
  assert.ok(svg.indexOf(">LibraryCarry<") < svg.indexOf(">CampusTank<"));
  assert.equal(svg.includes("Hela"), false, "Only one most-played hero per player");
  assert.equal(JSON.stringify(data), before);
});

test("missing ranks and stats remain unavailable while zero and negative RS are preserved", () => {
  const data = structuredClone(fixture);
  const selected = data.players.find((entry) => entry.uid === player.uid);
  selected.damage = null;
  selected.accuracy = 56;
  selected.healing = 0;
  selected.rank = { after: { rank: "Gold I", rank_score: 3800, rs: 0 }, change: 0 };
  const { teams } = getScoreboardTeams(data, player.uid);
  const svg = buildMatchScoreboardSvg(teams, player.uid);
  assert.ok(svg.includes(">0 RS<"));
  assert.ok(svg.includes(">— RS<"));
  assert.ok(svg.includes(">0<"));
  assert.ok(svg.includes("Average rank score unavailable"), "Partial rank scores are not presented as the team average");
  assert.equal(svg.includes("NaN"), false);
  assert.equal(svg.includes("undefined"), false);
});

test("all external text is escaped and the renderer cannot resolve remote, local, or nested SVG images", () => {
  const data = structuredClone(fixture);
  data.players[0].name = '<script x="bad">';
  data.players[0].heroes[0].name = "Hero & <Other>";
  data.players[0].heroes[0].icon = "https://assets.rivalsisland.com/hero.png";
  const { teams } = getScoreboardTeams(data, player.uid);
  teams[0].label = 'Team <& "Injected">';
  for (const image of ["https://evil.example/image.png", "file:///etc/passwd", "data:image/svg+xml;base64,PHN2Zz4="]) {
    const svg = buildMatchScoreboardSvg(teams, player.uid, new Map([[data.players[0].heroes[0].icon, image]]));
    assert.equal(svg.includes("<script"), false);
    assert.ok(svg.includes("Team &lt;&amp; &quot;Injected&quot;&gt;"));
    assert.ok(svg.includes("Hero &amp; &lt;Other&gt;"));
    assert.equal(svg.includes("<image "), false);
    assert.deepEqual(new Resvg(svg, { font: { loadSystemFonts: false } }).imagesToResolve(), []);
  }
});

test("real renderer produces a PNG with bounded size and keeps the selected player in oversized rosters", async () => {
  const { teams } = getScoreboardTeams(fixture, player.uid);
  const png = await renderMatchScoreboard(teams, player.uid, new Map());
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(png.readUInt32BE(16), 1440);
  assert.equal(png.readUInt32BE(20), 1170);
  assert.ok(png.length < 1_000_000);
  const crowded = { ...teams[0], players: Array.from({ length: 64 }, (_, index) => ({
    ...fixture.players[0], uid: String(index), name: `Player ${index}`, kills: index,
  })) };
  crowded.players[0] = { ...crowded.players[0], uid: player.uid, name: "Selected Player" };
  const svg = buildMatchScoreboardSvg([crowded], player.uid);
  assert.ok(svg.includes("12/64 players shown"));
  assert.ok(svg.includes("Selected Player"));
  assert.equal((svg.match(/font-weight="700" text-anchor="start">Player /g) ?? []).length, 11);
});

test("the searched player's losing team appears first without modifying match data", () => {
  const before = JSON.stringify(fixture);
  const { teams } = getScoreboardTeams(fixture, "2001");
  assert.equal(teams[0].result, "loss");
  assert.equal(teams[1].result, "win");
  assert.equal(JSON.stringify(fixture), before);
});

test("a normal message has the overview and one combined scoreboard with a single PNG attachment", async () => {
  await withMockFetch(() => assert.fail("This fixture needs no remote images"), async () => {
    const payload = await createMatchScoreboardMessage(player, fixture, 3, 20);
    assert.equal(payload.embeds.length, 2);
    assert.equal(payload.files.length, 1);
    assert.equal(payload.embeds[0].title, "CampusPlayer — Match History");
    assert.equal(payload.embeds[1].image.url, "attachment://history-3-scoreboard.png");
    assert.equal(payload.embeds[1].description, undefined);
    assert.equal(payload.files[0].name, "history-3-scoreboard.png");
    assert.equal(payload.files[0].attachment.subarray(1, 4).toString(), "PNG");
    assert.deepEqual(payload.attachments, []);
  });
});

test("combined teams share one header and have unique clipping paths so portraits stay in their own rows", () => {
  const { teams } = getScoreboardTeams(fixture, player.uid);
  const svg = buildMatchScoreboardSvg(teams, player.uid);
  assert.equal((svg.match(/>PLAYER</g) ?? []).length, 1);
  assert.equal((svg.match(/>RANK</g) ?? []).length, 1);
  assert.ok(svg.includes("Team 2 · WIN · Score 2"));
  assert.ok(svg.includes("Team 1 · LOSS · Score 0"));
  assert.ok(svg.indexOf("Team 2 · WIN") < svg.indexOf("Team 1 · LOSS"));
  const ids = [...svg.matchAll(/<clipPath id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, 36);
  assert.equal(new Set(ids).size, ids.length);
});

test("individual modes still render one participant section in the combined image", async () => {
  const individual = { ...fixture, teams: [] };
  const payload = await createMatchScoreboardMessage(player, individual, 0, 1);
  assert.equal(payload.embeds.length, 2);
  assert.equal(payload.files.length, 1);
  const { teams } = getScoreboardTeams(individual, player.uid);
  const svg = buildMatchScoreboardSvg(teams, player.uid);
  assert.ok(svg.includes(">Participants<"));
  assert.equal(svg.includes("Team 1"), false);
});

test("rendering-path failures retain the overview and text tables without leaking internal diagnostics", async (t) => {
  const diagnostics = t.mock.method(console, "error", () => {});
  const data = structuredClone(fixture);
  Object.defineProperty(data.players[0], "rank", { get() { throw new Error("Private diagnostic"); } });
  const payload = await createMatchScoreboardMessage(player, data, 0, 1);
  assert.equal(payload.embeds.length, 3);
  assert.match(payload.embeds[1].description, /```text/);
  assert.deepEqual(payload.files, []);
  assert.deepEqual(payload.attachments, []);
  assert.equal(diagnostics.mock.calls[0].arguments[0], "History fallback: failed during image rendering.");
});

test("a failed match-detail page clears previous image attachments when showing its summary", async (t) => {
  t.mock.method(console, "error", () => {});
  const history = { matches: [{ match_uid: fixture.match_uid, result: "win", played_at: fixture.played_at }] };
  await withMockFetch(async () => new Response(null, { status: 503 }), async () => {
    const pages = createDetailedHistoryPages(player, history, "dummy-key", "https://scoreboard-test.example");
    const payload = await pages[0]();
    assert.match(payload.embeds[0].description, /Full scoreboard unavailable/);
    assert.deepEqual(payload.files, []);
    assert.deepEqual(payload.attachments, []);
  });
});

test("successful detail pages do not build unused fallback summaries", async () => {
  const match = { match_uid: fixture.match_uid, result: "win", played_at: fixture.played_at };
  Object.defineProperty(match, "map", { get() { assert.fail("Summary fields should only be read on fallback"); } });
  await withMockFetch(async () => Response.json(fixture), async () => {
    const [loadPage] = createDetailedHistoryPages(player, { matches: [match] }, "dummy-key", "https://lazy-summary.example");
    const payload = await loadPage();
    assert.equal(payload.embeds.length, 2);
    assert.equal(payload.files.length, 1);
  });
});

test("standalone lookups reuse the scoreboard without history labels or page numbering", async () => {
  const payload = await createMatchScoreboardMessage(player, fixture);
  assert.equal(payload.embeds[0].title, "CampusPlayer — Match Details");
  assert.match(payload.embeds[0].footer.text, /^UID: 123456789/);
  assert.equal(payload.embeds[0].footer.text.includes("Match 1 / 1"), false);
  assert.equal(payload.embeds[1].image.url, "attachment://match-scoreboard.png");
  assert.equal(payload.files[0].name, "match-scoreboard.png");
});

test("standalone rendering failures keep the correct Match Details title in text fallbacks", async (t) => {
  t.mock.method(console, "error", () => {});
  const data = structuredClone(fixture);
  Object.defineProperty(data.players[0], "rank", { get() { throw new Error("Simulated rendering failure"); } });
  const payload = await createMatchScoreboardMessage(player, data);
  assert.equal(payload.embeds.length, 3);
  assert.equal(payload.embeds[0].title, "CampusPlayer — Match Details");
  assert.match(payload.embeds[0].footer.text, /^UID: 123456789/);
  assert.match(payload.embeds[1].description, /```text/);
  assert.deepEqual(payload.files, []);
  assert.deepEqual(payload.attachments, []);
});
