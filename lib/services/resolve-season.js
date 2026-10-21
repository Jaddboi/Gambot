// Resolves a public season number through the API catalog instead of assuming it equals an internal ID.
const { getSeasons } = require("../marvel-rivals-api/get-seasons");

async function resolveSeason(seasonNumber, apiKey, baseUrl) {
  if (seasonNumber == null) return null;
  const seasons = await getSeasons(apiKey, baseUrl);
  return seasons.find((season) => Number(season.number) === seasonNumber) ?? null;
}

module.exports = { resolveSeason };
