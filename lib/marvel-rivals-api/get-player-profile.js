// Fetches a basic player profile using a UID.
const { requestApi } = require("./request");

async function getPlayerProfileByUid(playerUid, apiKey, baseUrl) {
  if (typeof playerUid !== "string" || !/^[1-9][0-9]{0,19}$/.test(playerUid)) {
    throw new Error(
      "Player UID must contain 1–20 digits without a leading zero."
    );
  }

  if (typeof baseUrl !== "string" || baseUrl.trim() === "") {
    throw new Error("API base URL is required.");
  }
  const url = new URL(`/players/${encodeURIComponent(playerUid)}`, baseUrl);

  return requestApi(url, apiKey);
}

module.exports = { getPlayerProfileByUid };
