// Starts the bot, loads commands, sets its presence, and routes interactions to execution logic.
const path = require("path");
require("dotenv").config();
const { loadCommands } = require("./lib/discord/load-commands");
const { handleInteraction } = require("./lib/discord/handle-interaction");
const { setBotPresence } = require("./lib/discord/set-presence");
const {
  Client,
  Events,
  GatewayIntentBits,
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.commands = loadCommands(path.join(__dirname, "commands"));

client.once(Events.ClientReady, () => {
  console.log(`Ready! Logged in as ${client.user.tag}`);

  setBotPresence(client, {
    status: process.env.BOT_STATUS || "online",
    activityType: process.env.ACTIVITY_TYPE || "PLAYING",
    activityName: process.env.ACTIVITY_NAME || "Stats Tracker",
  });
});

// Listens for when an interaction is created and handles it
// An interaction represents someone using a bot feature, such as a slash command or button.
// It contains who acted, where they acted, any submitted options, and methods for replying.
// This listener receives each interaction and passes it to our slash-command handler.
client.on(Events.InteractionCreate, (commandInteraction) => {
  handleInteraction(commandInteraction, client.commands).catch(() => {
    console.error("Failed to handle interaction.");
  });
});

client.login(process.env.BOT_TOKEN);
