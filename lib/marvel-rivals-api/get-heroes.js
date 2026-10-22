// Fetches the hero catalog with validation, caching, and shared pending requests.
const { createApiUrl } = require("./validation");
const { getCachedApiResponse } = require("./cached-request");

const HEROES_CACHE_TTL_MS = 60 * 60 * 1000;

function validateHeroesResponse(result) {
  const message = "The player stats service returned invalid hero catalog data.";
  if (!Array.isArray(result?.heroes)) throw new Error(message);

  const seenIds = new Set();
  for (const hero of result.heroes) {
    const hasId = Number.isInteger(hero?.id) && hero.id >= 1 && hero.id <= 100000;
    const hasName = typeof hero?.name === "string" && hero.name.trim() !== "";
    if (!hasId || !hasName || seenIds.has(hero.id)) throw new Error(message);
    seenIds.add(hero.id);
  }
}

async function getHeroes(apiKey, baseUrl) {
  const url = createApiUrl("/heroes", apiKey, baseUrl);
  const result = await getCachedApiResponse({
    url,
    apiKey,
    ttlMs: HEROES_CACHE_TTL_MS,
    validate: validateHeroesResponse,
  });
  return result.heroes;
}

module.exports = { getHeroes };
