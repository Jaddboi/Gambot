// Fetches and validates hero identity, lore, and catalog details with a one-hour cache.
const { createApiUrl, validateHeroId } = require("./validation");
const { getCachedApiResponse } = require("./cached-request");

const HERO_DETAILS_CACHE_TTL_MS = 60 * 60 * 1000;

function validateHeroDetails(hero, heroId) {
  const message = "The hero information service returned invalid hero details.";
  const hasText = (value) => typeof value === "string" && value.trim() !== "";
  if (hero?.id !== heroId || !hasText(hero.name) || !hasText(hero.role)) throw new Error(message);

  for (const key of ["real_name", "description", "biography", "icon"]) {
    if (hero[key] != null && typeof hero[key] !== "string") throw new Error(message);
  }
  if (hero.icons != null) {
    if (typeof hero.icons !== "object" || Array.isArray(hero.icons)) throw new Error(message);
    for (const key of ["regular", "lord", "fullbody", "animated"]) {
      if (hero.icons[key] != null && typeof hero.icons[key] !== "string") throw new Error(message);
    }
  }
  if (hero.teamups != null) {
    if (!Array.isArray(hero.teamups)) throw new Error(message);
    for (const teamup of hero.teamups) {
      if (!Number.isSafeInteger(teamup?.id) || teamup.id < 1 || !hasText(teamup.name)) throw new Error(message);
    }
  }
  if (hero.skin_ids != null && (!Array.isArray(hero.skin_ids) ||
      hero.skin_ids.some((id) => typeof id !== "string" || !/^(?:ps)?[0-9]{1,30}$/.test(id)))) {
    throw new Error(message);
  }
}

async function getHeroDetailsById(heroId, apiKey, baseUrl) {
  validateHeroId(heroId);
  const url = createApiUrl(`/heroes/${heroId}`, apiKey, baseUrl);
  return getCachedApiResponse({
    url,
    apiKey,
    ttlMs: HERO_DETAILS_CACHE_TTL_MS,
    validate: (hero) => validateHeroDetails(hero, heroId),
  });
}

module.exports = { getHeroDetailsById };
