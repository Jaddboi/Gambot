// Resolves full hero names through the catalog and suggests names without guessing ambiguous forms.
const { getHeroes } = require("../marvel-rivals-api/get-heroes");

function normalizeHeroName(name) {
  return name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

async function resolveHero(heroName, apiKey, baseUrl) {
  if (typeof heroName !== "string" || heroName.length > 100) return { hero: null, suggestions: [] };
  const normalizedName = normalizeHeroName(heroName);
  if (normalizedName === "") return { hero: null, suggestions: [] };

  const heroes = await getHeroes(apiKey, baseUrl);
  const exactMatches = heroes.filter((hero) => normalizeHeroName(hero.name) === normalizedName);
  if (exactMatches.length === 1) return { hero: exactMatches[0], suggestions: [] };

  const candidates = exactMatches.length > 0
    ? exactMatches
    : heroes.filter((hero) => normalizeHeroName(hero.name).includes(normalizedName));
  return { hero: null, suggestions: candidates.slice(0, 5) };
}

module.exports = { resolveHero };
