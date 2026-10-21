// Restores mocked fetch and shared request state after each isolated API test.
const { clearCache } = require("../../lib/cache");
const { clearRateLimits } = require("../../lib/marvel-rivals-api/request");

async function withMockFetch(fetch, check) {
  const originalFetch = globalThis.fetch;
  clearCache();
  clearRateLimits();
  globalThis.fetch = fetch;
  try {
    await check();
  } finally {
    globalThis.fetch = originalFetch;
    clearCache();
    clearRateLimits();
  }
}

module.exports = { withMockFetch };
