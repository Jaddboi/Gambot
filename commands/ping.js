// Defines /ping and responds with the bot's response time and Discord gateway latency.
const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with pong and latency information"),
  async execute(commandInteraction) {
    const response = await commandInteraction.reply({
      content: "Pinging...",
      withResponse: true,
    });

    const pingTime = response.resource.message.createdTimestamp - commandInteraction.createdTimestamp;

    await commandInteraction.editReply(
      `Pong!\nBot Latency: ${pingTime}ms\nAPI Latency: ${Math.round(
        commandInteraction.client.ws.ping
      )}ms`
    );
  },
};
