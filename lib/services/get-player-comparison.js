// Loads players sequentially with bounded rate-limit retries and confirms matching comparison filters.
const { searchPlayerByUsername } = require("../marvel-rivals-api/search-player-by-username");
const { getPlayerCareerStatsByUid } = require("../marvel-rivals-api/get-player-career-stats");
const { getPlayerHeroStatsByUid } = require("../marvel-rivals-api/get-player-hero-stats");
const { retryRateLimitedRequest } = require("./retry-rate-limited-request");
const { formatMarkdownText } = require("../formatting/text");

function haveMatchingFilters(results, requested) {
  const [first, second] = results.map((result) => result.filters);
  for (const filters of [first, second]) {
    const hasSeason = filters.season === null ||
      (Number.isInteger(filters.season) && filters.season >= 0 && filters.season <= 10000);
    const hasMode = filters.game_mode === null ||
      (Number.isInteger(filters.game_mode) && filters.game_mode >= 0 && filters.game_mode <= 10000);
    const hasPlatform = [null, "pc", "ps", "xbox"].includes(filters.device_type);
    if (!hasSeason || !hasMode || !hasPlatform) return false;
    if (requested.season != null && filters.season !== requested.season) return false;
    if (requested.mode != null && filters.game_mode !== requested.mode) return false;
  }
  return first.season === second.season && first.game_mode === second.game_mode &&
    first.device_type === second.device_type;
}

async function getPlayerComparison(usernames, apiKey, baseUrl, { hero = null, season = null, mode = null } = {}) {
  const players = [];
  for (const username of usernames) {
    try {
      const player = await retryRateLimitedRequest(() => searchPlayerByUsername(username, apiKey, baseUrl));
      players.push(player);
    } catch (error) {
      if (error.message !== "Player not found." && error.status !== 404) throw error;
      return { message: `**${formatMarkdownText(username, 60)}** was not found. Check their Marvel Rivals username.` };
    }
  }
  if (players[0].uid === players[1].uid) {
    return { message: "Choose two different players to compare." };
  }

  const filters = { season, mode };
  const results = [];
  for (const player of players) {
    try {
      const result = await retryRateLimitedRequest(() => hero
        ? getPlayerHeroStatsByUid(player.uid, hero.id, apiKey, baseUrl, filters)
        : getPlayerCareerStatsByUid(player.uid, apiKey, baseUrl, filters));
      results.push(result);
    } catch (error) {
      if (error.status !== 404) throw error;
      return { message: `Stats are unavailable for **${formatMarkdownText(player.name, 60)}** and this selection.` };
    }
  }
  if (!haveMatchingFilters(results, filters)) {
    return { message: "The stats service did not confirm matching season, mode, and platform filters for both players. No comparison was made. Try selecting a season and mode explicitly." };
  }
  return { results };
}

module.exports = { getPlayerComparison };
