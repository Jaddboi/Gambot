// Looks up one match and displays its scoreboard from the selected player's perspective.
const { SlashCommandBuilder } = require("discord.js");
const { validateMatchUid } = require("../lib/marvel-rivals-api/validation");
const { searchPlayerByUsername } = require("../lib/marvel-rivals-api/search-player-by-username");
const { getMatchDetailsByUid } = require("../lib/marvel-rivals-api/get-match-details");
const { createMatchScoreboardMessage } = require("../lib/services/create-match-scoreboard-message");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("match")
    .setDescription("Shows a detailed match scoreboard")
    .addStringOption((option) =>
      option
        .setName("player")
        .setDescription("The player's Marvel Rivals username")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("match-id")
        .setDescription("The full match ID shown by /history")
        .setRequired(true)
    ),

  async execute(commandInteraction) {
    const username = commandInteraction.options.getString("player", true);
    const matchUid = commandInteraction.options.getString("match-id", true).trim();

    await commandInteraction.deferReply();

    try {
      validateMatchUid(matchUid);
    } catch {
      await commandInteraction.editReply(
        "Use the full match ID shown by /history: five groups of digits separated by underscores. Short replay codes are not supported."
      );
      return;
    }

    const apiKey = process.env.MARVEL_RIVALS_API_KEY;
    const baseUrl = process.env.MARVEL_RIVALS_API_BASE_URL;

    let player;
    try {
      player = await searchPlayerByUsername(username, apiKey, baseUrl);
    } catch (error) {
      if (error.message !== "Player not found." && error.status !== 404) throw error;
      await commandInteraction.editReply("No player was found with that username.");
      return;
    }

    let match;
    try {
      match = await getMatchDetailsByUid(matchUid, apiKey, baseUrl);
    } catch (error) {
      if (error.status !== 404) throw error;
      await commandInteraction.editReply("That match could not be found. Check the full match ID shown by /history.");
      return;
    }

    const participated = match.players.some((participant) => participant.uid === player.uid);
    if (!participated) {
      await commandInteraction.editReply("That player was not found in this match. Check the username and match ID.");
      return;
    }

    const payload = await createMatchScoreboardMessage(player, match);
    await commandInteraction.editReply({
      ...payload,
      components: [],
      allowedMentions: { parse: [] },
    });
  },
};
