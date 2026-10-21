// Loads command definitions and registers them globally with Discord when this script runs.
const path = require("path");
const { REST, Routes } = require("discord.js");
const { loadCommands } = require("./lib/discord/load-commands");

require("dotenv").config();

const deployCommands = async () => {
  try {
    const loadedCommands = loadCommands(path.join(__dirname, "commands"));

    const commands = loadedCommands.map((command) => command.data.toJSON());

    const rest = new REST().setToken(process.env.BOT_TOKEN);
    console.log(
      `Started refreshing ${commands.length} application slash commands globally.`
    );

    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
      body: commands,
    });

    console.log("Successfully reloaded all commands!");
  } catch (err) {
    console.error("Error deploying commands:", err);
  }
};

deployCommands();
