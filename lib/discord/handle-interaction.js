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
    if (err.code === 10062) {
      const ageMs = Number.isFinite(commandInteraction.createdTimestamp)
        ? Date.now() - commandInteraction.createdTimestamp
        : "unknown";
      console.error(`Discord rejected an expired or invalid command interaction (10062). Age at rejection: ${ageMs} ms. Run the command again.`);
      return; // An invalid interaction cannot receive another reply.
    }

    // SDK error objects may contain callback URLs with interaction tokens; log the stack only.
    console.error(err.stack ?? err.message);
    let content = "There was an error while executing this command!";
    if (err.status === 429 && Number.isFinite(err.retryAt)) {
      const waitSeconds = Math.ceil((err.retryAt - Date.now()) / 1000);
      content = waitSeconds > 0
        ? `The Marvel Rivals API rate limit was reached. Please wait ${waitSeconds} seconds and try again.`
        : "The Marvel Rivals API rate limit was reached. Please try again shortly.";
    }

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
