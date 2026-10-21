// Pages through embeds on one reply, restricting buttons to its invoking user.
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
} = require("discord.js");

async function paginateEmbeds(commandInteraction, pages, timeoutMs = 120_000) {
  if (!Array.isArray(pages) || pages.length === 0) {
    throw new Error("At least one embed page is required.");
  }

  let currentPage = 0;
  // Snapshot each page so edits always send the selected embed's complete JSON.
  const embeds = pages.map(page => typeof page.toJSON === "function" ? page.toJSON() : page);
  const previousId = "gambot:pages:previous";
  const nextId = "gambot:pages:next";
  const controls = (disabled = false) => new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(previousId)
      .setLabel("Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || currentPage === 0),
    new ButtonBuilder()
      .setCustomId("gambot:pages:counter")
      .setLabel(`${currentPage + 1} / ${pages.length}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(nextId)
      .setLabel("Next")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled || currentPage === pages.length - 1)
  );

  const render = () => ({
    content: `Page ${currentPage + 1} / ${pages.length}`,
    embeds: [embeds[currentPage]],
    components: pages.length > 1 ? [controls()] : [],
    allowedMentions: { parse: [] },
  });
  const message = await commandInteraction.editReply(render());
  if (pages.length === 1) return message;

  // Message-scoped collectors keep separate /stats invocations independent.
  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (buttonInteraction) => [previousId, nextId].includes(buttonInteraction.customId),
    time: timeoutMs,
  });

  let updates = Promise.resolve();
  collector.on("collect", (buttonInteraction) => {
    if (buttonInteraction.user.id !== commandInteraction.user.id) {
      buttonInteraction.reply({
        content: "These buttons belong to someone else's command. Run /stats to open your own pages.",
        flags: MessageFlags.Ephemeral,
      }).catch(() => {
        console.error("Failed to send pagination ownership reply.");
      });
      return;
    }

    // Acknowledge each click promptly, then serialize edits so rapid clicks stay ordered.
    const acknowledged = buttonInteraction.deferUpdate().then(() => true, () => false);
    updates = updates.then(async () => {
      if (!(await acknowledged) || collector.ended) return;
      const direction = buttonInteraction.customId === nextId ? 1 : -1;
      currentPage = Math.max(0, Math.min(pages.length - 1, currentPage + direction));
      // Interaction replies are edited through their webhook, not the channel-message route.
      await commandInteraction.editReply(render());
    }).catch(() => {
      console.error("Failed to update pagination page.");
      collector.stop("updateFailed");
    });
  });

  collector.on("end", () => {
    // Run cleanup after outstanding edits so an older edit cannot re-enable buttons.
    updates = updates.then(() => commandInteraction.editReply({
      ...render(), components: [controls(true)],
    }))
      .catch(() => {
        console.error("Failed to disable pagination buttons.");
      });
  });

  return message;
}

module.exports = { paginateEmbeds };
