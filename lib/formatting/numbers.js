// Formats counts, ratios, rank changes, and compact match statistics without treating missing data as zero.
function isNonNegativeNumber(value) {
  return Number.isFinite(value) && value >= 0;
}

function formatNumber(value) {
  return isNonNegativeNumber(value) ? value.toLocaleString("en-CA") : "Unavailable";
}

function formatCount(value) {
  return isNonNegativeNumber(value)
    ? value.toLocaleString("en-CA", { maximumFractionDigits: 0 })
    : "Unavailable";
}

function formatRatio(value) {
  return isNonNegativeNumber(value) ? value.toFixed(2) : "Unavailable";
}

function formatRankChange(value) {
  if (!Number.isFinite(value)) return "Unavailable";
  const sign = value > 0 ? "+" : "";
  return sign + value.toLocaleString("en-CA");
}

function formatMatchNumber(value, compact = false) {
  if (!isNonNegativeNumber(value)) return "—";
  if (value >= 1_000_000_000) return value.toExponential(1);
  if (compact && value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toLocaleString("en-CA", { maximumFractionDigits: 1 });
}

module.exports = { formatNumber, formatCount, formatRatio, formatRankChange, formatMatchNumber };
