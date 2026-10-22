// Finds the highest reported peak using rank level first and score only to break equal-level ties.
function findHighestRankPeak(seasons) {
  let highestPeak = null;

  for (const season of seasons) {
    if (typeof season.peak_rank !== "string" || season.peak_rank.trim() === "") continue;
    // A named peak without a comparable level prevents a reliable all-time maximum.
    if (!Number.isFinite(season.peak_rank_level)) return null;

    if (highestPeak === null || season.peak_rank_level > highestPeak.peak_rank_level) {
      highestPeak = season;
      continue;
    }

    const hasSameLevel = season.peak_rank_level === highestPeak.peak_rank_level;
    const score = season.peak_rank_score ?? -1;
    const highestScore = highestPeak.peak_rank_score ?? -1;
    if (hasSameLevel && score > highestScore) highestPeak = season;
  }

  return highestPeak;
}

module.exports = { findHighestRankPeak };
