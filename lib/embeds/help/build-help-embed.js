// Builds the command overview or one detailed guide without requesting player data.
const { EmbedBuilder } = require("discord.js");
const { commandGuides } = require("../../help/command-guides");

function buildHelpEmbed(commandName) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setFooter({ text: "Five-second cooldown per user and command • Help is visible only to you" });

  if (!commandName) {
    return embed
      .setTitle("Gambot — Command Help")
      .setDescription("Use `/help command:<name>` for options and examples. Player commands currently require a Marvel Rivals username.")
      .addFields(
        ...commandGuides.map((guide) => ({ name: `/${guide.name}`, value: guide.summary })),
        {
          name: "API Premium access",
          value: "Seasonal and all-time ranks require API Premium access. Hero proficiency also requires Premium; career stats remain usable if it is unavailable.",
        },
        {
          name: "Data freshness",
          value: "Player data can be cached by Gambot for up to 60 seconds; hero and season catalogs for one hour. Username searches are not cached. Cache age does not guarantee the provider has updated game data.",
        }
      );
  }

  const guide = commandGuides.find((entry) => entry.name === commandName);
  if (!guide) {
    return embed
      .setTitle("Command help unavailable")
      .setDescription("Use `/help` to see the available commands and choose one from the command option.");
  }

  embed
    .setTitle(`Gambot — /${guide.name}`)
    .setDescription(guide.summary)
    .addFields({ name: "Usage", value: `\`${guide.usage}\`\nAngle brackets are placeholders; square brackets mean optional.` });

  if (guide.options.length > 0) {
    embed.addFields({
      name: "Options",
      value: guide.options.map((option) => `**${option.name}** — ${option.description}`).join("\n"),
    });
  }

  return embed.addFields(
    { name: "Examples", value: guide.examples.map((example) => `\`${example}\``).join("\n") },
    { name: "What to know", value: guide.notes },
    {
      name: "Data freshness",
      value: "Gambot caches player data for up to 60 seconds and hero/season catalogs for one hour. Username searches are uncached. The provider may update underlying data later. /help and /ping make no game API requests.",
    }
  );
}

module.exports = { buildHelpEmbed };
