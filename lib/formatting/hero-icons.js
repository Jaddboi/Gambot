// Allows native hero thumbnails only from the provider's trusted HTTPS asset host.
function getHeroIconUrl(hero) {
  if (typeof hero?.icon !== "string" || hero.icon.length > 2048) return null;
  try {
    const url = new URL(hero.icon);
    const isTrusted = url.protocol === "https:" && url.hostname === "assets.rivalsisland.com" &&
      url.username === "" && url.password === "" && url.port === "";
    return isTrusted ? url.href : null;
  } catch {
    return null;
  }
}

module.exports = { getHeroIconUrl };
