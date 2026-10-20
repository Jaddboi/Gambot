// Fetches and validates career stats using a player UID.
const { requestApi } = require("./request");

async function getPlayerCareerStatsByUid(playerUid, apiKey, baseUrl) {
  if (typeof playerUid !== "string" || !/^[1-9][0-9]{0,19}$/.test(playerUid)) {
    throw new Error("Player UID must contain 1–20 digits without a leading zero.");
  }

  if (typeof baseUrl !== "string" || baseUrl.trim() === "") {
    throw new Error("API base URL is required.");
  }

  const url = new URL(`/players/${encodeURIComponent(playerUid)}/career`, baseUrl);
  const result = await requestApi(url, apiKey);

  if (
    result?.player?.uid !== playerUid ||
    typeof result.player.name !== "string" ||
    !result.career ||
    typeof result.career !== "object" ||
    Array.isArray(result.career) ||
    !result.filters ||
    typeof result.filters !== "object" ||
    Array.isArray(result.filters)
  ) {
    throw new Error("The player stats service returned invalid career data.");
  }

  // Preserve the player, applied filters, and stats for callers to use.
  return result;
}

module.exports = { getPlayerCareerStatsByUid };
