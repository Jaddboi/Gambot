// Searches for a player by username and returns the matching profile.
const { requestApi } = require("./request");

async function searchPlayerByUsername(username, apiKey, baseUrl) {
  if (
    typeof username !== "string" ||
    username.trim() === "" ||
    [...username.trim()].length > 16
  ) {
    throw new Error("Player username must contain 1–16 characters.");
  }

  if (typeof baseUrl !== "string" || baseUrl.trim() === "") {
    throw new Error("API base URL is required.");
  }

  const url = new URL("/players/search", baseUrl);
  url.searchParams.set("name", username.trim());

  const result = await requestApi(url, apiKey);

  if (result?.player === null) {
    throw new Error("Player not found.");
  }

  const player = result?.player;
  if (
    typeof player?.uid !== "string" ||
    !/^[1-9][0-9]{0,19}$/.test(player.uid) ||
    typeof player.name !== "string"
  ) {
    throw new Error("The player stats service returned invalid player data.");
  }

  return player;
}

module.exports = { searchPlayerByUsername };
