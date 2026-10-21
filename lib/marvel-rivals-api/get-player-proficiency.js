// Fetches validated hero proficiency by UID, with cached and shared pending requests.
const { createApiUrl, validatePlayerUid } = require("./validation");
const { getCachedApiResponse } = require("./cached-request");

const PROFICIENCY_CACHE_TTL_MS = 60_000;

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validateProficiencyResponse(result, playerUid) {
  const message = "The player stats service returned invalid proficiency data.";
  if (result?.uid !== playerUid || !Array.isArray(result.heroes)) throw new Error(message);

  for (const hero of result.heroes) {
    const hasId = Number.isSafeInteger(hero?.hero_id) && hero.hero_id > 0;
    const hasName = typeof hero?.name === "string" && hero.name.trim() !== "";
    const hasLevel = isCount(hero?.proficiency?.level);
    const hasPoints = isCount(hero?.proficiency?.points);
    const nextLevelPoints = hero?.proficiency?.points_to_next_level;
    const hasValidNextLevel = nextLevelPoints == null || isCount(nextLevelPoints);
    if (!hasId || !hasName || !hasLevel || !hasPoints || !hasValidNextLevel) {
      throw new Error(message);
    }
  }
}

async function getPlayerProficiencyByUid(playerUid, apiKey, baseUrl) {
  validatePlayerUid(playerUid);
  const url = createApiUrl(`/players/${encodeURIComponent(playerUid)}/proficiency`, apiKey, baseUrl);
  return getCachedApiResponse({
    url,
    apiKey,
    ttlMs: PROFICIENCY_CACHE_TTL_MS,
    validate: (result) => validateProficiencyResponse(result, playerUid),
  });
}

module.exports = { getPlayerProficiencyByUid };
