// Fetches, validates, caches, and shares RivalsIsland hero proficiency lookups by UID.
const { requestApi } = require("./request");
const { getCachedValue, setCachedValue } = require("../cache");
const pendingRequests = new Map();
const PROFICIENCY_CACHE_TTL_MS = 60_000;

async function getPlayerProficiencyByUid(playerUid, apiKey, baseUrl) {
  if (typeof playerUid !== "string" || !/^[1-9][0-9]{0,19}$/.test(playerUid)) {
    throw new Error("Player UID must contain 1–20 digits without a leading zero.");
  }
  if (typeof baseUrl !== "string" || baseUrl.trim() === "") {
    throw new Error("API base URL is required.");
  }
  const url = new URL(`/players/${encodeURIComponent(playerUid)}/proficiency`, baseUrl);
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new Error("API key is required.");
  }
  if (url.protocol !== "https:") {
    throw new Error("API base URL must use HTTPS.");
  }

  const cacheKey = url.href;
  const cached = getCachedValue(cacheKey);
  if (cached !== undefined) return cached;
  const existing = pendingRequests.get(cacheKey);
  if (existing !== undefined) return existing;

  const pending = requestApi(url, apiKey).then(result => {
    const isCount = value => Number.isSafeInteger(value) && value >= 0;
    if (
      result?.uid !== playerUid || !Array.isArray(result.heroes) ||
      !result.heroes.every(hero =>
        Number.isSafeInteger(hero?.hero_id) && hero.hero_id > 0 &&
        typeof hero.name === "string" && hero.name.trim() !== "" &&
        isCount(hero.proficiency?.level) && isCount(hero.proficiency?.points) &&
        (hero.proficiency.points_to_next_level == null || isCount(hero.proficiency.points_to_next_level))
      )
    ) {
      throw new Error("The player stats service returned invalid proficiency data.");
    }
    setCachedValue(cacheKey, result, PROFICIENCY_CACHE_TTL_MS);
    return result;
  });
  pendingRequests.set(cacheKey, pending);
  try {
    return await pending;
  } finally {
    pendingRequests.delete(cacheKey);
  }
}

module.exports = { getPlayerProficiencyByUid };
