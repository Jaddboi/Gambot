// Fetches the available seasons from the Marvel Rivals API.
const { requestApi } = require("./request");
const { createApiUrl } = require("./validation");
const { getCachedValue, setCachedValue } = require("../cache");

const SEASONS_CACHE_TTL_MS = 60 * 60 * 1000;

function validateSeasonsResponse(result) {
  const message = "The player stats service returned invalid season data.";
  if (!Array.isArray(result?.seasons)) throw new Error(message);
  for (const season of result.seasons) {
    const hasId = Number.isSafeInteger(season?.id) && season.id > 0;
    const hasNumber = typeof season?.number === "string" && /^\d+(?:\.[05])?$/.test(season.number);
    if (!hasId || !hasNumber) throw new Error(message);
  }
}

async function getSeasons(apiKey, baseUrl) {
  const url = createApiUrl("/seasons", apiKey, baseUrl);

  const cacheKey = url.href;
  const cachedSeasons = getCachedValue(cacheKey);

  if (cachedSeasons !== undefined) {
    return cachedSeasons;
  }

  const result = await requestApi(url, apiKey);
  validateSeasonsResponse(result);
  setCachedValue(cacheKey, result.seasons, SEASONS_CACHE_TTL_MS);
  return result.seasons;
}

module.exports = { getSeasons };
