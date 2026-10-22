// Tests bounded public-image downloads, cache expiry, safe origins, and graceful portrait failures.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadScoreboardImages, clearScoreboardImageCache } = require("../lib/rendering/history/load-scoreboard-images");
const { withMockFetch } = require("./helpers/mock-fetch.cjs");

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=", "base64");
const heroUrl = "https://assets.rivalsisland.com/hero.png";
const rankUrl = "https://rivalsisland.com/static/ranks/rank_6.png";
const player = { heroes: [{ name: "Hero", icon: heroUrl }], rank: { after: { rank: "Grandmaster II" } } };

async function withImages(fetch, check) {
  clearScoreboardImageCache();
  try {
    await withMockFetch(fetch, check);
  } finally {
    clearScoreboardImageCache();
  }
}

test("portraits and badges are deduplicated and downloaded without API credentials or redirects", async () => {
  const requests = [];
  await withImages(async (url, options) => {
    requests.push(url);
    assert.deepEqual(options.headers, { Accept: "image/png" });
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(png);
  }, async () => {
    const images = await loadScoreboardImages([player, player]);
    assert.deepEqual(requests, [heroUrl, rankUrl]);
    assert.equal(images.size, 2);
    assert.equal(images.get(heroUrl), `data:image/png;base64,${png.toString("base64")}`);
    await loadScoreboardImages([player]);
    assert.equal(requests.length, 2);
  });
});

test("untrusted and credential-bearing portrait URLs are rejected before a request", async () => {
  const invalid = ["https://evil.example/a.png", "http://assets.rivalsisland.com/a.png",
    "https://assets.rivalsisland.com.evil.example/a.png", "https://user:password@assets.rivalsisland.com/a.png",
    "https://assets.rivalsisland.com:8443/a.png", "file:///private/a.png", "data:image/png;base64,abc"];
  await withImages(() => assert.fail("Unsafe images must not be fetched"), async () => {
    for (const icon of invalid) {
      assert.equal((await loadScoreboardImages([{ heroes: [{ icon }] }])).size, 0);
    }
  });
});

test("failed, oversized, non-PNG, and excessive-dimension images use placeholders and can retry", async () => {
  const oversizedDimensions = Buffer.from(png);
  oversizedDimensions.writeUInt32BE(4096, 16);
  const failures = [
    () => new Response(null, { status: 404 }),
    () => new Response(png, { headers: { "content-length": "600000" } }),
    () => new Response(Buffer.alloc(600000)),
    () => new Response("<svg><script>bad</script></svg>"),
    () => new Response(oversizedDimensions),
    () => { throw new Error("Simulated timeout"); },
  ];
  for (const fail of failures) {
    let calls = 0;
    await withImages(async () => ++calls === 1 ? fail() : new Response(png), async () => {
      const portraitOnly = [{ heroes: [{ icon: heroUrl }] }];
      assert.equal((await loadScoreboardImages(portraitOnly)).size, 0);
      assert.equal((await loadScoreboardImages(portraitOnly)).size, 1);
      assert.equal(calls, 2);
    });
  }
});

test("portrait cache expires at exactly one day", async (t) => {
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  let calls = 0;
  await withImages(async () => { calls++; return new Response(png); }, async () => {
    const portraitOnly = [{ heroes: [{ icon: heroUrl }] }];
    await loadScoreboardImages(portraitOnly);
    now += 86_399_999;
    await loadScoreboardImages(portraitOnly);
    assert.equal(calls, 1);
    now++;
    await loadScoreboardImages(portraitOnly);
    assert.equal(calls, 2);
  });
});

test("at most six downloads run concurrently and later batches stop when the budget is exhausted", async (t) => {
  let active = 0;
  let maximum = 0;
  const players = Array.from({ length: 12 }, (_, i) => ({ heroes: [{ icon: `https://assets.rivalsisland.com/${i}.png` }] }));
  await withImages(async () => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setImmediate(resolve));
    active--;
    return new Response(png);
  }, async () => {
    assert.equal((await loadScoreboardImages(players)).size, 12);
    assert.equal(maximum, 6);
  });

  let now = 1000;
  let calls = 0;
  t.mock.method(Date, "now", () => now);
  await withImages(async () => {
    calls++;
    now += 2001;
    return new Response(null, { status: 404 });
  }, async () => {
    assert.equal((await loadScoreboardImages(players)).size, 0);
    assert.equal(calls, 1, "Do not start remaining downloads after the deadline");
  });
});
