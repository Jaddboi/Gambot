// Builds a full-width stat comparison using player names and an explicit lead, tie, or missing-data label.
const { formatMarkdownText } = require("./text");

function buildComparisonField(name, playerNames, values, {
  precision = 2,
  suffix = "",
  differenceSuffix = suffix,
  lowerIsBetter = false,
} = {}) {
  const players = playerNames.map((playerName) => formatMarkdownText(playerName, 60));
  // Compare at the displayed precision so identical labels never show a hidden winner.
  const rounded = values.map((value) => {
    if (!Number.isFinite(value) || value < 0) return null;
    const displayed = value >= 1e12 ? value.toExponential(precision) : value.toFixed(precision);
    const number = Number(displayed);
    return Number.isFinite(number) ? number : null;
  });
  const format = (value, unit) => {
    const label = value >= 1e12 ? value.toExponential(precision) : value.toLocaleString("en-CA", {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    });
    return label + unit;
  };

  let winner = null;
  let verdict;
  if (rounded.includes(null)) {
    verdict = "Comparison unavailable";
  } else if (rounded[0] === rounded[1]) {
    verdict = "Tie";
  } else {
    const firstIsHigher = rounded[0] > rounded[1];
    winner = (lowerIsBetter ? !firstIsHigher : firstIsHigher) ? 0 : 1;
    const difference = Math.abs(rounded[0] - rounded[1]);
    verdict = `${players[winner]} leads by **${format(difference, differenceSuffix)}**`;
  }

  const labels = rounded.map((value, index) => {
    const label = `${players[index]}: ${value === null ? "Unavailable" : format(value, suffix)}`;
    return winner === index ? `🟢 **${label}**` : label;
  });
  return {
    name: lowerIsBetter ? `${name} (lower is better)` : name,
    value: [...labels, verdict].join("\n"),
    inline: false,
  };
}

module.exports = { buildComparisonField };
