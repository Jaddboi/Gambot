// Routes command interactions and handles execution errors.
const { MessageFlags } = require("discord.js");
const { checkCooldown } = require("../cooldowns");
const COMMAND_COOLDOWN_MS = 5_000;
async function handleInteraction(commandInteraction, commands) {
  if (!commandInteraction.isChatInputCommand()) return; // Makes sure the interaction is a slash command

  const command = commands.get(commandInteraction.commandName);

  if (!command) {
    await commandInteraction.reply({
      content: "This command is currently unavailable.",
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  const remainingMs = checkCooldown(
    commandInteraction.user.id,
    commandInteraction.commandName,
    COMMAND_COOLDOWN_MS
  );

  if (remainingMs > 0) {
    const remainingSeconds = Math.ceil(remainingMs / 1000);

    await commandInteraction.reply({
      content: `Please wait ${remainingSeconds} seconds before using this command again.`,
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  try {
    await command.execute(commandInteraction);
  } catch (err) {
    console.error(err);
    const content = "There was an error while executing this command!";

    if (commandInteraction.replied) {
      await commandInteraction.followUp({
        content,
        flags: MessageFlags.Ephemeral,
      });
    } else if (commandInteraction.deferred) {
      await commandInteraction.editReply({ content });
    } else {
      await commandInteraction.reply({
        content,
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}

module.exports = { handleInteraction };
