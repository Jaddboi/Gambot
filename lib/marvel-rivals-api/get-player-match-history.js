// Fetches validated recent matches with cached and shared pending requests.
const { createApiUrl, validatePlayerUid, validateMode } = require("./validation");
const { getCachedApiResponse } = require("./cached-request");

const HISTORY_CACHE_TTL_MS = 60_000;
const HISTORY_PAGE = 0;
const HISTORY_PAGE_SIZE = 20;

function validateHistoryResponse(result, playerUid) {
  const invalidResponseMessage =
    "The player stats service returned invalid match history data.";

  // Check the response structure before accessing its matches.
  const isCorrectPlayer = result?.uid === playerUid;
  const hasMatchesArray = Array.isArray(result?.matches);

  if (!isCorrectPlayer || !hasMatchesArray) {
    throw new Error(invalidResponseMessage);
  }

  // Confirm that the response describes the page we requested.
  const pagination = result.pagination;
  const isCorrectPage = pagination?.page === HISTORY_PAGE;
  const isCorrectPageSize = pagination?.page_size === HISTORY_PAGE_SIZE;
  const hasMoreFlag = typeof pagination?.has_more === "boolean";

  if (!isCorrectPage || !isCorrectPageSize || !hasMoreFlag) {
    throw new Error(invalidResponseMessage);
  }

  // Check each match separately. An empty list needs no further checks.
  const allowedResults = ["win", "loss", "draw", "abandoned"];

  for (const match of result.matches) {
    const hasValidMatchId =
      typeof match?.match_uid === "string" && match.match_uid.trim() !== "";
    const hasValidResult = allowedResults.includes(match?.result);
    const hasValidTimestamp =
      typeof match?.played_at === "string" &&
      Number.isFinite(Date.parse(match.played_at));

    if (!hasValidMatchId || !hasValidResult || !hasValidTimestamp) {
      throw new Error(invalidResponseMessage);
    }
  }

}

async function getPlayerMatchHistoryByUid(playerUid, apiKey, baseUrl, filters = {}) {
  const { mode } = filters;
  validatePlayerUid(playerUid);
  validateMode(mode);
  const url = createApiUrl(`/players/${encodeURIComponent(playerUid)}/match-history`, apiKey, baseUrl);
  url.searchParams.set("page", HISTORY_PAGE);
  url.searchParams.set("page_size", HISTORY_PAGE_SIZE);
  if (mode != null) url.searchParams.set("category", mode);

  return getCachedApiResponse({
    url,
    apiKey,
    ttlMs: HISTORY_CACHE_TTL_MS,
    validate: (result) => validateHistoryResponse(result, playerUid),
  });
}

module.exports = { getPlayerMatchHistoryByUid };
