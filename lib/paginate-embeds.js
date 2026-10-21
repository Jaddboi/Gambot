// Pages through static embeds or lazy page loaders, restricting buttons to the invoking user.
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
  // Static pages are snapshotted; lazy pages can load a scoreboard when opened.
  const pageLoaders = pages.map((page) => {
    if (typeof page === "function") return page;
    const embed = typeof page.toJSON === "function" ? page.toJSON() : page;
    return async () => ({ embeds: [embed] });
  });
  let pageContent = await pageLoaders[0]();
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

  const render = (disabled = false) => {
    const payload = {
      ...pageContent,
      content: `Page ${currentPage + 1} / ${pages.length}`,
      components: pages.length > 1 ? [controls(disabled)] : [],
      allowedMentions: { parse: [] },
    };
    // discord.js appends upload IDs to this array; preserve cached page content.
    if (Array.isArray(pageContent.attachments)) {
      payload.attachments = pageContent.attachments.map((attachment) => ({ ...attachment }));
    }
    return payload;
  };
  const message = await commandInteraction.editReply(render());
  if (pages.length === 1) return message;

  // Message-scoped collectors keep separate command invocations independent.
  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (buttonInteraction) => [previousId, nextId].includes(buttonInteraction.customId),
    time: timeoutMs,
  });

  let updates = Promise.resolve();
  collector.on("collect", (buttonInteraction) => {
    if (buttonInteraction.user.id !== commandInteraction.user.id) {
      buttonInteraction.reply({
        content: "These buttons belong to someone else's command. Run this command to open your own pages.",
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
      const nextPage = Math.max(0, Math.min(pages.length - 1, currentPage + direction));
      if (nextPage === currentPage) return;
      const nextContent = await pageLoaders[nextPage]();
      // Advance the counter only after the matching page has finished loading.
      pageContent = nextContent;
      currentPage = nextPage;
      // Interaction replies are edited through their webhook, not the channel-message route.
      await commandInteraction.editReply(render());
    }).catch(() => {
      console.error("Failed to update pagination page.");
      collector.stop("updateFailed");
    });
  });

  collector.on("end", () => {
    // Run cleanup after outstanding edits so an older edit cannot re-enable buttons.
    updates = updates.then(() => {
      const payload = render(true);
      // Keep the current image on expiry; do not re-upload it or fetch details again.
      delete payload.files;
      delete payload.attachments;
      return commandInteraction.editReply(payload);
    })
      .catch(() => {
        console.error("Failed to disable pagination buttons.");
      });
  });

  return message;
}

module.exports = { paginateEmbeds };
