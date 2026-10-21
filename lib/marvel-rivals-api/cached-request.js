// Shares pending API requests and caches responses only after endpoint validation succeeds.
const { requestApi } = require("./request");
const { getCachedValue, setCachedValue } = require("../cache");

const pendingRequests = new Map();

async function getCachedApiResponse({ url, apiKey, ttlMs, validate }) {
  const cacheKey = url.href;
  const cached = getCachedValue(cacheKey);
  if (cached !== undefined) return cached;

  const existingRequest = pendingRequests.get(cacheKey);
  if (existingRequest !== undefined) return existingRequest;

  const request = requestApi(url, apiKey).then((result) => {
    validate(result);
    setCachedValue(cacheKey, result, ttlMs);
    return result;
  });
  pendingRequests.set(cacheKey, request);
  try {
    return await request;
  } finally {
    pendingRequests.delete(cacheKey);
  }
}

module.exports = { getCachedApiResponse };
