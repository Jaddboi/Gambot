// Finds a player by username and prints career stats without starting Discord.
const { getPlayerCareerStatsByUid } = require("../lib/marvel-rivals-api/get-player-career-stats");
const { searchPlayerByUsername } = require("../lib/marvel-rivals-api/search-player-by-username");

async function main() {
  const username = process.argv.slice(2).join(" ");

  if (!username) {
    throw new Error('Usage: node scripts/check-player.js "PlayerUsername"');
  }

  const apiKey = process.env.MARVEL_RIVALS_API_KEY;
  const baseUrl = process.env.MARVEL_RIVALS_API_BASE_URL;

  const player = await searchPlayerByUsername(username, apiKey, baseUrl);
  const result = await getPlayerCareerStatsByUid(player.uid, apiKey, baseUrl);

  console.log({
    uid: player.uid,
    name: player.name,
    level: player.account_level,
    exactMatch: player.exact_match,
    filters: result.filters,
    career: result.career,
  });
}

if (require.main === module) {
  require("dotenv").config({ quiet: true });
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
