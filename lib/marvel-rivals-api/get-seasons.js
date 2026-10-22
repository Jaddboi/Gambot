// Fetches validated seasons with cached and shared pending requests.
const { createApiUrl } = require("./validation");
const { getCachedApiResponse } = require("./cached-request");

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

  const result = await getCachedApiResponse({
    url,
    apiKey,
    ttlMs: SEASONS_CACHE_TTL_MS,
    validate: validateSeasonsResponse,
  });
  return result.seasons;
}

module.exports = { getSeasons };
