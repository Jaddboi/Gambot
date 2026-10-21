// Fetches and shares validated match details, caching successful results for 60 seconds.
const { requestApi } = require("./request");
const { getCachedValue, setCachedValue } = require("../cache");

const MATCH_CACHE_TTL_MS = 60_000;
const pendingRequests = new Map();
const outcomes = ["win", "loss", "draw", "abandoned"];

function validateMatchDetails(result, matchUid) {
  const message = "The stats service returned invalid match details.";
  const hasCorrectMatch = result?.match_uid === matchUid;
  const hasTeams = Array.isArray(result?.teams) && result.teams.length <= 64;
  const hasPlayers = Array.isArray(result?.players) && result.players.length > 0 && result.players.length <= 64;
  const hasTimestamp = typeof result?.played_at === "string" && Number.isFinite(Date.parse(result.played_at));

  if (!hasCorrectMatch || !hasTeams || !hasPlayers || !hasTimestamp) {
    throw new Error(message);
  }

  for (const team of result.teams) {
    if (!Number.isSafeInteger(team?.id) || !outcomes.includes(team?.result)) {
      throw new Error(message);
    }
  }

  for (const player of result.players) {
    const hasUid = typeof player?.uid === "string" && player.uid.trim() !== "" && player.uid.length <= 40;
    const hasTeam = Number.isSafeInteger(player?.team_id);
    const hasResult = outcomes.includes(player?.result);
    const hasHeroes = Array.isArray(player?.heroes) && player.heroes.length <= 64;

    if (!hasUid || !hasTeam || !hasResult || !hasHeroes) {
      throw new Error(message);
    }
    for (const hero of player.heroes) {
      if (!Number.isSafeInteger(hero?.id) || hero.id <= 0) throw new Error(message);
    }
  }
}

async function getMatchDetailsByUid(matchUid, apiKey, baseUrl) {
  const hasValidId = typeof matchUid === "string" && matchUid.length >= 9 &&
    matchUid.length <= 160 && /^[0-9]+_[0-9]+_[0-9]+_[0-9]+_[0-9]+$/.test(matchUid);

  if (!hasValidId) throw new Error("Match ID must contain five groups of digits separated by underscores.");
  if (typeof baseUrl !== "string" || baseUrl.trim() === "") throw new Error("API base URL is required.");
  if (typeof apiKey !== "string" || apiKey.trim() === "") throw new Error("API key is required.");

  const url = new URL(`/matches/${encodeURIComponent(matchUid)}`, baseUrl);
  if (url.protocol !== "https:") throw new Error("API base URL must use HTTPS.");

  const cacheKey = url.href;
  const cached = getCachedValue(cacheKey);
  if (cached !== undefined) return cached;

  const existingRequest = pendingRequests.get(cacheKey);
  if (existingRequest !== undefined) return existingRequest;

  const request = requestApi(url, apiKey).then((result) => {
    validateMatchDetails(result, matchUid);
    setCachedValue(cacheKey, result, MATCH_CACHE_TTL_MS);
    return result;
  });
  pendingRequests.set(cacheKey, request);

  try {
    return await request;
  } finally {
    pendingRequests.delete(cacheKey);
  }
}

module.exports = { getMatchDetailsByUid };
