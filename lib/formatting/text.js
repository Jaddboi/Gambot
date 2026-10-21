// Formats plain text and Markdown embed text; code-block tables use their own sanitization.
const { escapeMarkdown } = require("discord.js");

function formatText(value, limit = 1024) {
  if (typeof value !== "string" || value.trim() === "") return "Unavailable";
  return value.trim().slice(0, limit);
}

function formatMarkdownText(value, limit = 100) {
  const text = formatText(value).replace(/[\r\n\t]/g, " ");
  return escapeMarkdown(text).slice(0, limit);
}

module.exports = { formatText, formatMarkdownText };
