// Fetches the available seasons from the Marvel Rivals API.
const { requestApi } = require("./request");
const { getCachedValue, setCachedValue } = require("../cache");

const SEASONS_CACHE_TTL_MS = 60 * 60 * 1000;

async function getSeasons(apiKey, baseUrl) {
  if (typeof baseUrl !== "string" || baseUrl.trim() === "") {
    throw new Error("API base URL is required.");
  }

  const url = new URL("/seasons", baseUrl);

  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new Error("API key is required.");
  }

  if (url.protocol !== "https:") {
    throw new Error("API base URL must use HTTPS.");
  }

  const cacheKey = url.href;
  const cachedSeasons = getCachedValue(cacheKey);

  if (cachedSeasons !== undefined) {
    return cachedSeasons;
  }

  const result = await requestApi(url, apiKey);

  if (
    !Array.isArray(result?.seasons) ||
    !result.seasons.every(
      (season) =>
        Number.isSafeInteger(season?.id) &&
        season.id > 0 &&
        typeof season.number === "string" &&
        /^\d+(?:\.[05])?$/.test(season.number)
    )
  ) {
    throw new Error("The player stats service returned invalid season data.");
  }

  setCachedValue(cacheKey, result.seasons, SEASONS_CACHE_TTL_MS);
  return result.seasons;
}

module.exports = { getSeasons };
