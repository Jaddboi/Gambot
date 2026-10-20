// Keeps authentication, timeouts, HTTP errors, and JSON parsing in one place.
const rateLimits = new Map();

function getRetryDelayMs(headers) {
  const delayMs = Number(headers.get("X-RateLimit-Retry-After-Ms"));
  if (Number.isFinite(delayMs) && delayMs > 0) {
    return Math.ceil(delayMs);
  }

  const secondsDelayMs = Number(headers.get("Retry-After")) * 1000;
  if (Number.isFinite(secondsDelayMs) && secondsDelayMs > 0) {
    return Math.ceil(secondsDelayMs);
  }

  return 1000;
}

function clearRateLimits() {
  rateLimits.clear();
}

async function requestApi(url, apiKey) {
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new Error("API key is required.");
  }

  if (url.protocol !== "https:") {
    throw new Error("API base URL must use HTTPS.");
  }

  const now = Date.now();
  const retryAllowedAt = rateLimits.get(url.origin) ?? 0;

  if (retryAllowedAt > now) {
    throw new Error("Too many requests. Please try again later.");
  }

  rateLimits.delete(url.origin);

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
        const delayMs = getRetryDelayMs(response.headers);
        const existingRetryAt = rateLimits.get(url.origin) ?? 0;

        rateLimits.set(
          url.origin,
          Math.max(existingRetryAt, Date.now() + delayMs)
        );

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

module.exports = { requestApi, clearRateLimits };
