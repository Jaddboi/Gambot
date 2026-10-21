// Loads a command with isolated dummy API settings without loading dotenv or the real environment.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

function loadCommand(name, { apiKey = "dummy-key", baseUrl = "https://command-test.example" } = {}) {
  const filename = path.resolve(__dirname, "../../commands", `${name}.js`);
  const context = {
    require: createRequire(filename),
    module: { exports: {} },
    process: { env: {
      MARVEL_RIVALS_API_KEY: apiKey,
      MARVEL_RIVALS_API_BASE_URL: baseUrl,
    } },
  };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), context, { filename });
  return context.module.exports;
}

module.exports = { loadCommand };
