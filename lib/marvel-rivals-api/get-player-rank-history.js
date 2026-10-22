// Fetches validated competitive ranks by season, with cached and shared pending requests.
const { createApiUrl, validatePlayerUid } = require("./validation");
const { getCachedApiResponse } = require("./cached-request");

const RANK_HISTORY_CACHE_TTL_MS = 60_000;

function validateRankHistoryResponse(result, playerUid, seasonId) {
  const message = "The player stats service returned invalid rank history data.";
  const hasFilters = result?.filters != null &&
    typeof result.filters === "object" && !Array.isArray(result.filters);
  if (result?.uid !== playerUid || !hasFilters || !Array.isArray(result.seasons)) {
    throw new Error(message);
  }
  // Do not present a different season, or an unconfirmed subset, as the requested data.
  if (result.filters.season !== seasonId) throw new Error(message);

  const seenSeasons = new Set();
  for (const rank of result.seasons) {
    const hasSeasonId = Number.isInteger(rank?.season_id) &&
      rank.season_id >= 0 && rank.season_id <= 10000;
    const hasPlatform = ["pc", "ps", "xbox"].includes(rank?.device_type);
    if (!hasSeasonId || !hasPlatform) throw new Error(message);
    if (seasonId !== null && rank.season_id !== seasonId) throw new Error(message);

    const entryKey = `${rank.season_id}:${rank.device_type}`;
    if (seenSeasons.has(entryKey)) throw new Error(message);
    seenSeasons.add(entryKey);

    for (const key of ["season", "rank", "peak_rank"]) {
      if (rank[key] != null && typeof rank[key] !== "string") throw new Error(message);
    }
    for (const key of ["rank_level", "peak_rank_level", "rank_score", "peak_rank_score"]) {
      if (rank[key] != null && (!Number.isFinite(rank[key]) || rank[key] < 0)) {
        throw new Error(message);
      }
    }
  }
}

async function getPlayerRankHistoryByUid(playerUid, apiKey, baseUrl, seasonId = null) {
  validatePlayerUid(playerUid);
  const hasValidSeason = seasonId === null ||
    (Number.isInteger(seasonId) && seasonId >= 0 && seasonId <= 10000);
  if (!hasValidSeason) throw new Error("Season must be an integer between 0 and 10000.");

  const url = createApiUrl(`/players/${encodeURIComponent(playerUid)}/rank-history`, apiKey, baseUrl);
  if (seasonId !== null) url.searchParams.set("season", seasonId);

  return getCachedApiResponse({
    url,
    apiKey,
    ttlMs: RANK_HISTORY_CACHE_TTL_MS,
    validate: (result) => validateRankHistoryResponse(result, playerUid, seasonId),
  });
}

module.exports = { getPlayerRankHistoryByUid };
