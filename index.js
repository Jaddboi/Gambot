// Starts the bot, loads commands, sets its presence, and routes interactions to execution logic.
const path = require("path");
require("dotenv").config();
const { loadCommands } = require("./lib/load-commands");
const { handleInteraction } = require("./lib/handle-interaction");
const {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  ActivityType,
  PresenceUpdateStatus,
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.User,
    Partials.GuildMember,
  ],
});

client.commands = loadCommands(path.join(__dirname, "commands"));

client.once(Events.ClientReady, () => {
  console.log(`Ready! Logged in as ${client.user.tag}`);

  const statusType = process.env.BOT_STATUS || "online";
  const activityType = process.env.ACTIVITY_TYPE || "PLAYING";
  const activityName = process.env.ACTIVITY_NAME || "Stats Tracker";

  const activityTypeMap = {
    PLAYING: ActivityType.Playing,
    WATCHING: ActivityType.Watching,
    LISTENING: ActivityType.Listening,
    STREAMING: ActivityType.Streaming,
    COMPETING: ActivityType.Competing,
  };

  const statusMap = {
    online: PresenceUpdateStatus.Online,
    idle: PresenceUpdateStatus.Idle,
    dnd: PresenceUpdateStatus.DoNotDisturb,
    invisible: PresenceUpdateStatus.Invisible,
  };

  client.user.setPresence({
    status: statusMap[statusType],
    activities: [
      {
        name: activityName,
        type: activityTypeMap[activityType],
      },
    ],
  });

  console.log(`Bot status set to: ${statusType}`);
  console.log(`Activity set to: ${activityType}`);
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
