// Fetches one player's hero career stats and verifies the returned player, hero, and selected filters.
const { createApiUrl, validatePlayerUid, validateHeroId, validateSeason, validateMode } = require("./validation");
const { getCachedApiResponse } = require("./cached-request");

const HERO_STATS_CACHE_TTL_MS = 60_000;

function validateHeroStatsResponse(result, playerUid, heroId, { season, mode }) {
  const message = "The player stats service returned invalid hero stats data.";
  const hasCareer = result?.career != null && typeof result.career === "object" && !Array.isArray(result.career);
  const hasFilters = result?.filters != null && typeof result.filters === "object" && !Array.isArray(result.filters);
  if (result?.player?.uid !== playerUid || typeof result.player.name !== "string" ||
      result?.hero?.id !== heroId || typeof result.hero.name !== "string" || !hasCareer || !hasFilters) {
    throw new Error(message);
  }
  // Reject ignored filters rather than presenting another selection as the requested stats.
  if (season != null && result.filters.season !== season) throw new Error(message);
  if (mode != null && result.filters.game_mode !== mode) throw new Error(message);
}

async function getPlayerHeroStatsByUid(playerUid, heroId, apiKey, baseUrl, filters = {}) {
  validatePlayerUid(playerUid);
  validateHeroId(heroId);
  validateSeason(filters.season);
  validateMode(filters.mode);

  const url = createApiUrl(`/players/${encodeURIComponent(playerUid)}/heroes/${heroId}`, apiKey, baseUrl);
  if (filters.season != null) url.searchParams.set("season", filters.season);
  if (filters.mode != null) url.searchParams.set("game_mode", filters.mode);

  return getCachedApiResponse({
    url,
    apiKey,
    ttlMs: HERO_STATS_CACHE_TTL_MS,
    validate: (result) => validateHeroStatsResponse(result, playerUid, heroId, filters),
  });
}

module.exports = { getPlayerHeroStatsByUid };
