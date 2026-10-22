// Fetches validated career stats by UID, with cached and shared pending requests.
const { createApiUrl, validatePlayerUid, validateMode, validateSeason } = require("./validation");
const { getCachedApiResponse } = require("./cached-request");

const CAREER_CACHE_TTL_MS = 60_000;

function validateCareerResponse(result, playerUid) {
  const hasCorrectPlayer = result?.player?.uid === playerUid;
  const hasPlayerName = typeof result?.player?.name === "string";
  const hasCareer = result?.career != null && typeof result.career === "object" && !Array.isArray(result.career);
  const hasFilters = result?.filters != null && typeof result.filters === "object" && !Array.isArray(result.filters);
  if (!hasCorrectPlayer || !hasPlayerName || !hasCareer || !hasFilters) {
    throw new Error("The player stats service returned invalid career data.");
  }
}

async function getPlayerCareerStatsByUid(playerUid, apiKey, baseUrl, filters = {}) {
  const { season, mode } = filters;
  validateSeason(season);
  validatePlayerUid(playerUid);
  validateMode(mode);

  const url = createApiUrl(`/players/${encodeURIComponent(playerUid)}/career`, apiKey, baseUrl);
  if (season != null) url.searchParams.set("season", season);
  if (mode != null) url.searchParams.set("game_mode", mode);

  return getCachedApiResponse({
    url,
    apiKey,
    ttlMs: CAREER_CACHE_TTL_MS,
    validate: (result) => validateCareerResponse(result, playerUid),
  });
}

module.exports = { getPlayerCareerStatsByUid };
