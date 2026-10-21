// Selects a player's main match hero and formats trusted portraits and result colors.
const RESULT_COLORS = { win: 0x57c879, loss: 0xf08389, draw: 0x718bfc, abandoned: 0x718bfc };

function getResultColor(result) {
  return RESULT_COLORS[result] ?? 0x718bfc;
}

function getMostPlayedHero(player) {
  let selected = null;
  for (const hero of player.heroes) {
    if (!selected || (hero.play_time?.seconds ?? 0) > (selected.play_time?.seconds ?? 0)) {
      selected = hero;
    }
  }
  return selected;
}

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

module.exports = { getResultColor, getMostPlayedHero, getHeroIconUrl };
