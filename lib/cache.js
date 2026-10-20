// Temporarily stores fetched data with an expiration time.
const cache = new Map();
const MAX_CACHE_ENTRIES = 100;

function setCachedValue(key, value, ttlMs) {
  const entry = {
    value,
    expiresAt: Date.now() + ttlMs,
  };

  cache.delete(key);
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }

  cache.set(key, entry);
}

function getCachedValue(key) {
  const entry = cache.get(key);
  if (!entry) {
    return undefined;
  }
  if (Date.now() >= entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function clearCache() {
  cache.clear();
}

module.exports = { setCachedValue, getCachedValue, clearCache };
