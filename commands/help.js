// Defines /help and privately displays locally stored command guides.
const { MessageFlags, SlashCommandBuilder } = require("discord.js");
const { commandGuides } = require("../lib/help/command-guides");
const { buildHelpEmbed } = require("../lib/embeds/help/build-help-embed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Explains Gambot commands, options, and data freshness")
    .addStringOption((option) =>
      option
        .setName("command")
        .setDescription("The command to explain; omit for an overview")
        .setRequired(false)
        .addChoices(...commandGuides.map((guide) => ({ name: `/${guide.name}`, value: guide.name })))
    ),

  async execute(commandInteraction) {
    const commandName = commandInteraction.options.getString("command");
    await commandInteraction.reply({
      embeds: [buildHelpEmbed(commandName)],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  },
};
