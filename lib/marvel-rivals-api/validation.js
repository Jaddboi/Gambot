// Validates shared API request inputs before requests or cached results are used.
function validateApiKey(apiKey) {
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new Error("API key is required.");
  }
}

function validatePlayerUid(playerUid) {
  if (typeof playerUid !== "string" || !/^[1-9][0-9]{0,19}$/.test(playerUid)) {
    throw new Error("Player UID must contain 1–20 digits without a leading zero.");
  }
}

function validateMode(mode) {
  if (mode != null && ![1, 2].includes(mode)) {
    throw new Error("Mode must be 1 (Quick Play) or 2 (Competitive).");
  }
}

function validateSeason(season) {
  const isValid = season == null || (Number.isInteger(season) && season >= 0 && season <= 10000);
  if (!isValid) throw new Error("Season must be an integer between 0 and 10000.");
}

function createApiUrl(endpoint, apiKey, baseUrl) {
  if (typeof baseUrl !== "string" || baseUrl.trim() === "") {
    throw new Error("API base URL is required.");
  }
  validateApiKey(apiKey);
  const url = new URL(endpoint, baseUrl);
  if (url.protocol !== "https:") {
    throw new Error("API base URL must use HTTPS.");
  }
  return url;
}

module.exports = { validateApiKey, validatePlayerUid, validateMode, validateSeason, createApiUrl };
