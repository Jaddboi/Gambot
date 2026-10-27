// Builds a hero overview and readable biography pages, without making API or image requests.
const { EmbedBuilder, escapeMarkdown } = require("discord.js");
const { formatCount } = require("../../formatting/numbers");
const { formatMarkdownText } = require("../../formatting/text");
const { getHeroIconUrl } = require("../../formatting/hero-icons");

const BIOGRAPHY_CHARS_PER_PAGE = 1500;
const MAX_BIOGRAPHY_PAGES = 5;
const MAX_TEAMUPS_SHOWN = 8;

function getBiographyPages(biography) {
  if (typeof biography !== "string" || biography.trim() === "") return [];
  let remaining = biography.trim();
  const chunks = [];
  while (remaining.length > 0 && chunks.length < MAX_BIOGRAPHY_PAGES) {
    let end = Math.min(BIOGRAPHY_CHARS_PER_PAGE, remaining.length);
    if (end < remaining.length) {
      const boundary = Math.max(remaining.lastIndexOf("\n", end), remaining.lastIndexOf(" ", end));
      if (boundary > BIOGRAPHY_CHARS_PER_PAGE / 2) end = boundary;
    }
    // Escape only a bounded chunk; processing an entire oversized story can block the bot.
    chunks.push(escapeMarkdown(remaining.slice(0, end).trim()));
    remaining = remaining.slice(end).trimStart();
  }
  if (remaining !== "") chunks[chunks.length - 1] += "\n\nBiography shortened to fit this view.";
  return chunks;
}

function getTeamupsLabel(teamups) {
  if (!Array.isArray(teamups)) return "Unavailable";
  if (teamups.length === 0) return "No team-ups listed.";
  const lines = teamups.slice(0, MAX_TEAMUPS_SHOWN).map((teamup) => `• ${formatMarkdownText(teamup.name, 100)}`);
  if (teamups.length > MAX_TEAMUPS_SHOWN) lines.push(`…and ${teamups.length - MAX_TEAMUPS_SHOWN} more.`);
  return lines.join("\n");
}

function buildHeroInfoPages(hero, catalogHero = null) {
  const name = formatMarkdownText(hero.name, 100);
  const iconUrl = getHeroIconUrl(hero) ?? getHeroIconUrl({ icon: hero.icons?.regular }) ?? getHeroIconUrl(catalogHero);
  const page = (label) => {
    const embed = new EmbedBuilder().setColor(0x002a5c).setTitle(`${name} — ${label}`);
    if (iconUrl) embed.setThumbnail(iconUrl);
    return embed;
  };

  const overview = page("Hero Info")
    .setDescription(formatMarkdownText(hero.description, 1500))
    .addFields(
      { name: "Role", value: formatMarkdownText(hero.role), inline: true },
      { name: "Real name", value: formatMarkdownText(hero.real_name), inline: true },
      { name: "Catalog skins", value: formatCount(hero.skin_ids?.length), inline: true },
      { name: "Team-ups", value: getTeamupsLabel(hero.teamups), inline: false }
    );
  const biography = getBiographyPages(hero.biography);
  if (biography.length === 0) overview.addFields({ name: "Biography", value: "No biography is available." });
  const pages = [overview, ...biography.map((text) => page("Biography").setDescription(text))];
  pages.forEach((embed, index) => embed.setFooter({
    text: `Page ${index + 1} / ${pages.length} • Hero information • Cache: up to 1 hour`,
  }));
  return pages;
}

module.exports = { buildHeroInfoPages };
