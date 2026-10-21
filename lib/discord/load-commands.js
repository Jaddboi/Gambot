// Loads and validates command files, rejects duplicate names, and returns a collection of commands.
const fs = require("fs");
const path = require("path");
const { Collection } = require("discord.js");

function loadCommands(directory) {
  const commands = new Collection();
  const commandFiles = fs
    .readdirSync(directory)
    .filter((file) => file.endsWith(".js"));

  for (const file of commandFiles) {
    const filePath = path.join(directory, file);
    const command = require(filePath);

    if (
      typeof command?.data?.toJSON === "function" &&
      typeof command?.execute === "function"
    ) {
      if (commands.has(command.data.name)) {
        throw new Error(`Duplicate command name: ${command.data.name}`);
      }
      commands.set(command.data.name, command);
    } else {
      console.log(
        `The command ${filePath} is missing a required "data" or "execute" property`
      );
    }
  }

  return commands;
}

module.exports = { loadCommands };
