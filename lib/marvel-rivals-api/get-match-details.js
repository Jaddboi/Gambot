// Fetches and shares validated match details, caching successful results for 60 seconds.
const { createApiUrl, validateMatchUid } = require("./validation");
const { getCachedApiResponse } = require("./cached-request");

const MATCH_CACHE_TTL_MS = 60_000;
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
  validateMatchUid(matchUid);
  const url = createApiUrl(`/matches/${encodeURIComponent(matchUid)}`, apiKey, baseUrl);
  return getCachedApiResponse({
    url,
    apiKey,
    ttlMs: MATCH_CACHE_TTL_MS,
    validate: (result) => validateMatchDetails(result, matchUid),
  });
}

module.exports = { getMatchDetailsByUid };
