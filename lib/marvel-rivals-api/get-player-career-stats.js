// Fetches and validates career stats using a player UID.
const { requestApi } = require("./request");
const { getCachedValue, setCachedValue } = require("../cache");
const CAREER_CACHE_TTL_MS = 60_000;

async function getPlayerCareerStatsByUid(playerUid, apiKey, baseUrl) {
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

  const cacheKey = url.href;
  const cachedResult = getCachedValue(cacheKey);

  if (cachedResult !== undefined) {
    return cachedResult;
  }

  const result = await requestApi(url, apiKey);

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
  // Preserve the player, applied filters, and stats for callers to use.
  return result;
}

module.exports = { getPlayerCareerStatsByUid };
