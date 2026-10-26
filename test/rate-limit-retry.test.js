// Tests bounded comparison retries using a fake clock without real API calls or waits.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { retryRateLimitedRequest } = require("../lib/services/retry-rate-limited-request");
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));
const rateLimit = (retryAt) => Object.assign(new Error("Too many requests."), { status: 429, retryAt });

test("a retry waits until the exact reported deadline and then succeeds", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1000 });
  let calls = 0;
  const pending = retryRateLimitedRequest(async () => {
    if (++calls === 1) throw rateLimit(2500);
    return "ok";
  });
  await nextTurn();
  t.mock.timers.tick(1499);
  await nextTurn();
  assert.equal(calls, 1);
  t.mock.timers.tick(1);
  assert.equal(await pending, "ok");
  assert.equal(calls, 2);
});

test("a second rate limit propagates instead of scheduling an unbounded retry loop", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1000 });
  let calls = 0;
  const pending = assert.rejects(retryRateLimitedRequest(async () => {
    calls++;
    throw rateLimit(Date.now() + 1500);
  }), (error) => error.status === 429 && error.retryAt === 4000);
  await nextTurn();
  t.mock.timers.tick(1500);
  await pending;
  assert.equal(calls, 2);
});

test("long waits and errors without a valid API retry deadline are not retried", async () => {
  for (const error of [rateLimit(Date.now() + 60_000), rateLimit(NaN), new Error("Connection failed"),
    Object.assign(new Error("Access denied"), { status: 403, retryAt: Date.now() + 1 })]) {
    let calls = 0;
    await assert.rejects(retryRateLimitedRequest(async () => { calls++; throw error; }), (caught) => caught === error);
    assert.equal(calls, 1);
  }
});
