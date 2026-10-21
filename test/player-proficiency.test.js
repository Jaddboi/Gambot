// Tests proficiency requests, page rendering, and command integration with dummy settings only.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { withMockFetch: withFetch } = require("./helpers/mock-fetch.cjs");
const { loadCommand } = require("./helpers/load-command.cjs");
const { EventEmitter } = require("node:events");
const { clearCache } = require("../lib/cache");
const { clearRateLimits } = require("../lib/marvel-rivals-api/request");
const { getPlayerProficiencyByUid } = require("../lib/marvel-rivals-api/get-player-proficiency");
const { buildPlayerProficiencyPages } = require("../lib/embeds/stats/build-player-proficiency-pages");
const { buildPlayerStatsPages } = require("../lib/embeds/stats/build-player-stats-pages");

const player = { uid: "123456789", name: "Dummy Player" };
const baseUrl = "https://proficiency-test.example";
const apiKey = "dummy-key";
const hero = index => ({
  hero_id: index + 1, name: `Hero ${index}`, icon: null,
  proficiency: { level: index, rank: "Test Rank", points: index * 100, points_to_next_level: 100 },
});
const proficiency = { uid: player.uid, heroes: [hero(0), hero(1)] };

test("proficiency requests share pending work and cache validated results", async () => {
  let respond;
  let calls = 0;
  const response = new Promise(resolve => { respond = resolve; });
  await withFetch(async (url, options) => {
    calls++;
    assert.equal(url.href, `${baseUrl}/players/${player.uid}/proficiency`);
    assert.equal(options.headers["x-api-key"], apiKey);
    return response;
  }, async () => {
    const first = getPlayerProficiencyByUid(player.uid, apiKey, baseUrl);
    const second = getPlayerProficiencyByUid(player.uid, apiKey, baseUrl);
    assert.equal(calls, 1);
    respond(Response.json(proficiency));
    assert.deepEqual(await Promise.all([first, second]), [proficiency, proficiency]);
    assert.deepEqual(await getPlayerProficiencyByUid(player.uid, apiKey, baseUrl), proficiency);
    assert.equal(calls, 1);
  });
});

test("denied or malformed proficiency data is not cached and permits another attempt", async () => {
  for (const badResponse of [
    () => new Response(null, { status: 403 }),
    () => Response.json({ uid: "999", heroes: [] }),
    () => Response.json({ uid: player.uid, heroes: [{ ...hero(0), proficiency: null }] }),
  ]) {
    clearCache();
    let calls = 0;
    await withFetch(async () => ++calls === 1 ? badResponse() : Response.json(proficiency), async () => {
      await assert.rejects(getPlayerProficiencyByUid(player.uid, apiKey, baseUrl));
      assert.deepEqual(await getPlayerProficiencyByUid(player.uid, apiKey, baseUrl), proficiency);
      assert.equal(calls, 2);
    });
  }
});

test("proficiency validates input before making requests", async () => {
  await withFetch(async () => assert.fail("Must not fetch invalid input"), async () => {
    await assert.rejects(getPlayerProficiencyByUid("../search", apiKey, baseUrl), /Player UID/);
    await assert.rejects(getPlayerProficiencyByUid(player.uid, "", baseUrl), /API key/);
    await assert.rejects(getPlayerProficiencyByUid(player.uid, apiKey, ""), /base URL/);
    await assert.rejects(getPlayerProficiencyByUid(player.uid, apiKey, "http://example.test"), /HTTPS/);
  });
});

test("all proficiency heroes get pages sorted by points with consistent total page counts", () => {
  const data = { uid: player.uid, heroes: Array.from({ length: 12 }, (_, index) => hero(index)) };
  const pages = buildPlayerStatsPages({ player, result: { player, career: {} }, proficiency: data }).map(page => page.toJSON());
  assert.equal(pages.length, 5);
  assert.equal(pages[3].fields.length, 9);
  assert.equal(pages[4].fields.length, 3);
  assert.equal(pages[3].fields[0].name, "Hero 11");
  assert.match(pages[3].fields[0].value, /Level: 11\nPoints: 1,100/);
  assert.match(pages[4].fields[2].value, /Level: 0\nPoints: 0/);
  assert.equal(data.heroes[0].name, "Hero 0");
  pages.forEach((page, index) => assert.match(page.footer.text, new RegExp(`Page ${index + 1} / 5`)));
});

test("empty proficiency records and unavailable access have different messages", () => {
  const [empty] = buildPlayerProficiencyPages(player, { uid: player.uid, heroes: [] });
  const [unavailable] = buildPlayerProficiencyPages(player, null);
  assert.match(empty.toJSON().description, /no hero proficiency records/);
  assert.match(unavailable.toJSON().description, /Premium-only/);
  const [zero] = buildPlayerProficiencyPages(player, {
    uid: player.uid, heroes: [{ ...hero(0), proficiency: { level: 0, points: 0, rank: null, points_to_next_level: null } }],
  });
  assert.match(zero.toJSON().fields[0].value, /Rank: Unavailable\nLevel: 0\nPoints: 0\nTo next level: Unavailable/);
});

test("stats command switches the actual embed to proficiency and handles denied access", async () => {
  const command = loadCommand("stats", { apiKey, baseUrl });
  for (const denied of [false, true]) {
    clearCache(); clearRateLimits();
    const requests = [];
    const payloads = [];
    const collector = new EventEmitter();
    collector.ended = false;
    const message = {
      createMessageComponentCollector: () => collector,
      edit: () => assert.fail("Channel-message edits must not be used"),
    };
    await withFetch(async url => {
      requests.push(url.pathname);
      if (url.pathname === "/players/search") return Response.json({ player });
      if (url.pathname.endsWith("/career")) return Response.json({ player, filters: {}, career: {} });
      assert.equal(url.pathname, `/players/${player.uid}/proficiency`);
      return denied ? new Response(null, { status: 403 }) : Response.json(proficiency);
    }, async () => {
      await command.execute({
        user: { id: "owner" },
        options: {
          getString: () => player.name,
          getNumber: () => null,
          getBoolean: () => null,
          getInteger: () => null,
        },
        deferReply: async () => {},
        editReply: async payload => { payloads.push(payload); return message; },
      });
      assert.match(payloads[0].embeds[0].title, /Overview/);
      for (let index = 0; index < 3; index++) {
        collector.emit("collect", {
          customId: "gambot:pages:next", user: { id: "owner" }, deferUpdate: async () => {},
        });
      }
      await new Promise(resolve => setImmediate(resolve));
      assert.match(payloads[1].embeds[0].title, /Combat/);
      assert.match(payloads[2].embeds[0].title, /Impact/);
      const last = payloads.at(-1);
      assert.match(last.embeds[0].title, /Hero Proficiency/);
      assert.match(last.embeds[0].footer.text, /Page 4 \/ 4/);
      assert.equal(last.components[0].toJSON().components[1].label, "4 / 4");
      if (denied) assert.match(last.embeds[0].description, /Premium-only/);
      else assert.equal(last.embeds[0].fields[0].name, "Hero 1");
      assert.equal(requests.length, 3);
    });
  }
});
