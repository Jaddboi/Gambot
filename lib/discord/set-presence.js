// Applies the configured bot presence, keeping startup focused on connecting and listening.
const { ActivityType, PresenceUpdateStatus } = require("discord.js");

const ACTIVITY_TYPES = {
  PLAYING: ActivityType.Playing,
  WATCHING: ActivityType.Watching,
  LISTENING: ActivityType.Listening,
  STREAMING: ActivityType.Streaming,
  COMPETING: ActivityType.Competing,
};
const STATUSES = {
  online: PresenceUpdateStatus.Online,
  idle: PresenceUpdateStatus.Idle,
  dnd: PresenceUpdateStatus.DoNotDisturb,
  invisible: PresenceUpdateStatus.Invisible,
};

function setBotPresence(client, { status = "online", activityType = "PLAYING", activityName = "Stats Tracker" }) {
  client.user.setPresence({
    status: STATUSES[status] ?? PresenceUpdateStatus.Online,
    activities: [{ name: activityName, type: ACTIVITY_TYPES[activityType] ?? ActivityType.Playing }],
  });
}

module.exports = { setBotPresence };
