// Tests that season catalog and match-history callers share validated pending requests and can retry failures.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getSeasons } = require("../lib/marvel-rivals-api/get-seasons");
const { getPlayerMatchHistoryByUid } = require("../lib/marvel-rivals-api/get-player-match-history");
const { withMockFetch } = require("./helpers/mock-fetch.cjs");

const apiKey = "dummy-key";
const baseUrl = "https://shared-lookups.example";
const lookups = [
  {
    name: "season catalog",
    run: () => getSeasons(apiKey, baseUrl),
    valid: { seasons: [{ id: 312, number: "9.5" }] },
    invalid: { seasons: [{ id: null, number: "9.5" }] },
  },
  {
    name: "match history",
    run: () => getPlayerMatchHistoryByUid("123456789", apiKey, baseUrl),
    valid: { uid: "123456789", matches: [], pagination: { page: 0, page_size: 20, has_more: false } },
    invalid: { uid: "987654321", matches: [], pagination: { page: 0, page_size: 20, has_more: false } },
  },
];

for (const lookup of lookups) {
  test(`${lookup.name} shares one pending request and then returns the cached result`, async () => {
    let calls = 0;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    await withMockFetch(async () => {
      calls++;
      await gate;
      return Response.json(lookup.valid);
    }, async () => {
      const first = lookup.run();
      const second = lookup.run();
      assert.equal(calls, 1);
      release();
      const [a, b] = await Promise.all([first, second]);
      assert.strictEqual(a, b);
      assert.strictEqual(await lookup.run(), a);
      assert.equal(calls, 1);
    });
  });

  test(`${lookup.name} rejects all shared callers on invalid data and allows a fresh retry`, async () => {
    let calls = 0;
    await withMockFetch(async () => Response.json(++calls === 1 ? lookup.invalid : lookup.valid), async () => {
      const outcomes = await Promise.allSettled([lookup.run(), lookup.run()]);
      assert.equal(calls, 1);
      assert.ok(outcomes.every((outcome) => outcome.status === "rejected" && /invalid/.test(outcome.reason.message)));
      await lookup.run();
      assert.equal(calls, 2);
    });
  });
}
