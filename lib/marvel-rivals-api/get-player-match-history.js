// Fetches a player's recent matches using their UID.
const { requestApi } = require("./request");
const { getCachedValue, setCachedValue } = require("../cache");

const HISTORY_CACHE_TTL_MS = 60_000;

async function getPlayerMatchHistoryByUid(
  playerUid,
  apiKey,
  baseUrl,
  filters = {}
) {
  const { mode } = filters;

  if (typeof playerUid !== "string" || !/^[1-9][0-9]{0,19}$/.test(playerUid)) {
    throw new Error(
      "Player UID must contain 1–20 digits without a leading zero."
    );
  }

  if (typeof baseUrl !== "string" || baseUrl.trim() === "") {
    throw new Error("API base URL is required.");
  }

  const isSupportedMode = mode == null || [1, 2].includes(mode);

  if (!isSupportedMode) {
    throw new Error("Mode must be 1 (Quick Play) or 2 (Competitive).");
  }

  const url = new URL(
    `/players/${encodeURIComponent(playerUid)}/match-history`,
    baseUrl
  );

  url.searchParams.set("page", 0);
  url.searchParams.set("page_size", 20);

  if (mode != null) {
    url.searchParams.set("category", mode);
  }

  const hasApiKey = typeof apiKey === "string" && apiKey.trim() !== "";

  if (!hasApiKey) {
    throw new Error("API key is required.");
  }

  const usesHttps = url.protocol === "https:";

  if (!usesHttps) {
    throw new Error("API base URL must use HTTPS.");
  }

  const cacheKey = url.href;
  const cachedHistory = getCachedValue(cacheKey);

  if (cachedHistory !== undefined) {
    return cachedHistory;
  }

  const result = await requestApi(url, apiKey);
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
  const isCorrectPage = pagination?.page === 0;
  const isCorrectPageSize = pagination?.page_size === 20;
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

  setCachedValue(cacheKey, result, HISTORY_CACHE_TTL_MS);
  return result;
}

module.exports = { getPlayerMatchHistoryByUid };
