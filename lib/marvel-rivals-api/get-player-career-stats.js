// Fetches career stats by UID, reusing cached results and pending lookups.
const { requestApi } = require("./request");
const { getCachedValue, setCachedValue } = require("../cache");
const CAREER_CACHE_TTL_MS = 60_000;
const pendingRequests = new Map();

async function getPlayerCareerStatsByUid(
  playerUid,
  apiKey,
  baseUrl,
  filters = {}
) {
  const { season, mode } = filters;

  if (
    season != null &&
    (!Number.isInteger(season) || season < 0 || season > 10000)
  ) {
    throw new Error("Season must be an integer between 0 and 10000.");
  }

  if (mode != null && ![1, 2].includes(mode)) {
    throw new Error("Mode must be 1 (Quick Play) or 2 (Competitive).");
  }

  if (typeof playerUid !== "string" || !/^[1-9][0-9]{0,19}$/.test(playerUid)) {
    throw new Error(
      "Player UID must contain 1–20 digits without a leading zero."
    );
  }

  if (typeof baseUrl !== "string" || baseUrl.trim() === "") {
    throw new Error("API base URL is required.");
  }

  const url = new URL(
    `/players/${encodeURIComponent(playerUid)}/career`,
    baseUrl
  );

  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new Error("API key is required.");
  }

  if (url.protocol !== "https:") {
    throw new Error("API base URL must use HTTPS.");
  }

  if (season != null) {
    url.searchParams.set("season", season);
  }

  if (mode != null) {
    url.searchParams.set("game_mode", mode);
  }

  const cacheKey = url.href;
  const cachedResult = getCachedValue(cacheKey);

  if (cachedResult !== undefined) {
    return cachedResult;
  }

  const existingRequest = pendingRequests.get(cacheKey);

  if (existingRequest !== undefined) {
    return existingRequest;
  }

  const pendingRequest = requestApi(url, apiKey).then((result) => {
    if (
      result?.player?.uid !== playerUid ||
      typeof result.player.name !== "string" ||
      !result.career ||
      typeof result.career !== "object" ||
      Array.isArray(result.career) ||
      !result.filters ||
      typeof result.filters !== "object" ||
      Array.isArray(result.filters)
    ) {
      throw new Error("The player stats service returned invalid career data.");
    }

    setCachedValue(cacheKey, result, CAREER_CACHE_TTL_MS);
    return result;
  });

  pendingRequests.set(cacheKey, pendingRequest);

  try {
    return await pendingRequest;
  } finally {
    pendingRequests.delete(cacheKey);
  }
}

module.exports = { getPlayerCareerStatsByUid };
