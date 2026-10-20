// Fetches RivalsIsland player profiles and career stats using shared request handling.
async function getPlayer(playerUid, apiKey, baseUrl) {
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

async function getPlayerCareer(playerUid, apiKey, baseUrl) {
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

async function searchPlayer(username, apiKey, baseUrl) {
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

// Keeps authentication, timeouts, HTTP errors, and JSON parsing in one place.
async function requestApi(url, apiKey) {
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new Error("API key is required.");
  }

  if (url.protocol !== "https:") {
    throw new Error("API base URL must use HTTPS.");
  }

  let response;

  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
  } catch (err) {
    if (err.name === "TimeoutError") {
      throw new Error("The player lookup timed out. Please try again.");
    }

    throw new Error("Could not connect to the player stats service.");
  }

  if (!response.ok) {
    switch (response.status) {
      case 401:
        throw new Error("The API key is missing or invalid.");

      case 402:
        throw new Error("The API account has insufficient credits.");

      case 403:
        throw new Error(
          "Access denied. The data may be private or require a different plan."
        );

      case 404:
        throw new Error("Player not found.");

      case 422:
        throw new Error("The API rejected the request parameters.");

      case 429:
        throw new Error("Too many requests. Please try again later.");

      default:
        throw new Error(
          `Player lookup failed with HTTP status ${response.status}.`
        );
    }
  }

  try {
    const playerData = await response.json();
    return playerData;
  } catch (err) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      throw new Error("The player lookup timed out. Please try again.");
    }

    if (err.name === "SyntaxError") {
      throw new Error("The player stats service returned invalid JSON.");
    }

    throw new Error("Could not read the player stats response.");
  }
}

module.exports = { getPlayer, getPlayerCareer, searchPlayer };
