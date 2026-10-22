// Loads only trusted PNG badges/portraits, with a small cache, size limits, and a shared time budget.
const { getMostPlayedHero } = require("../../embeds/history/match-formatting");
const { getHeroIconUrl } = require("../../formatting/hero-icons");
const { getRankIconUrl } = require("../../formatting/ranks");

const imageCache = new Map();
const MAX_IMAGE_BYTES = 512 * 1024;
const MAX_CACHE_IMAGES = 64;
const IMAGE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const IMAGE_LOAD_BUDGET_MS = 2000;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function isTrustedImageUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    if (url.hostname === "assets.rivalsisland.com") return true;
    return url.hostname === "rivalsisland.com" && /^\/static\/ranks\/rank_[1-9]\.png$/.test(url.pathname);
  } catch {
    return false;
  }
}

async function fetchImage(url, timeoutMs) {
  if (!isTrustedImageUrl(url)) return null;
  try {
    const response = await fetch(url, {
      headers: { Accept: "image/png" },
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const declaredSize = Number(response.headers.get("content-length"));
    if (!response.ok || declaredSize > MAX_IMAGE_BYTES || !response.body) {
      await response.body?.cancel();
      return null;
    }

    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);
    const isPng = bytes.length >= 24 && bytes.subarray(0, 8).equals(PNG_SIGNATURE) &&
      bytes.toString("ascii", 12, 16) === "IHDR";
    if (!isPng) return null;
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (width < 1 || height < 1 || width > 2048 || height > 2048) return null;
    return `data:image/png;base64,${bytes.toString("base64")}`;
  } catch {
    // Missing portraits must not prevent a scoreboard from loading.
    return null;
  }
}

function clearScoreboardImageCache() {
  imageCache.clear();
}

async function loadScoreboardImages(players) {
  const urls = new Set();
  for (const player of players) {
    const heroUrl = getHeroIconUrl(getMostPlayedHero(player));
    const rankUrl = getRankIconUrl(player.rank?.after?.rank);
    if (heroUrl) urls.add(heroUrl);
    if (rankUrl) urls.add(rankUrl);
  }

  const images = new Map();
  const pending = [];
  for (const url of urls) {
    const cached = imageCache.get(url);
    if (cached && cached.expiresAt > Date.now()) images.set(url, cached.data);
    else {
      imageCache.delete(url);
      pending.push(url);
    }
  }

  const deadline = Date.now() + IMAGE_LOAD_BUDGET_MS;
  let next = 0;
  async function loadNextImage() {
    while (next < pending.length) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) return;
      const url = pending[next++];
      const data = await fetchImage(url, Math.min(1500, remainingMs));
      if (!data) continue;
      images.set(url, data);
      if (imageCache.size >= MAX_CACHE_IMAGES) imageCache.delete(imageCache.keys().next().value);
      imageCache.set(url, { data, expiresAt: Date.now() + IMAGE_CACHE_TTL_MS });
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, pending.length) }, loadNextImage));
  return images;
}

module.exports = { loadScoreboardImages, clearScoreboardImageCache };
