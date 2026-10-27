// Tests help registration, guide accuracy, and private replies without live configuration or requests.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ApplicationCommandOptionType, MessageFlags } = require("discord.js");
const { loadCommand } = require("./helpers/load-command.cjs");
const { withMockFetch } = require("./helpers/mock-fetch.cjs");
const { commandGuides } = require("../lib/help/command-guides");
const { buildHelpEmbed } = require("../lib/embeds/help/build-help-embed");

async function getHelpReply(selection = null) {
  // Blank API settings prove that help does not depend on configured game credentials.
  const command = loadCommand("help", { apiKey: "", baseUrl: "" });
  const replies = [];
  await command.execute({
    options: {
      getString: (name) => {
        assert.equal(name, "command");
        return selection;
      },
    },
    reply: async (payload) => { replies.push(payload); },
  });
  assert.equal(replies.length, 1);
  return replies[0];
}

function embedText(embed) {
  return [embed.title, embed.description, ...(embed.fields ?? []).map((field) => `${field.name}\n${field.value}`)]
    .join("\n");
}

test("help offers every implemented command as an optional string choice", () => {
  const definition = loadCommand("help").data.toJSON();
  assert.equal(definition.name, "help");
  assert.equal(definition.options.length, 1);
  const option = definition.options[0];
  assert.equal(option.name, "command");
  assert.equal(option.type, ApplicationCommandOptionType.String);
  assert.equal(option.required, false);

  const commandNames = fs.readdirSync(path.resolve(__dirname, "../commands"))
    .filter((filename) => filename.endsWith(".js"))
    .map((filename) => loadCommand(filename.slice(0, -3)).data.toJSON().name)
    .sort();
  assert.deepEqual(option.choices.map((choice) => choice.value).sort(), commandNames);
  assert.equal(new Set(option.choices.map((choice) => choice.value)).size, commandNames.length);
});

test("guides document every registered option and preserve required and optional usage", () => {
  for (const guide of commandGuides) {
    const definition = loadCommand(guide.name).data.toJSON();
    const target = guide.subcommand
      ? definition.options.find((option) => option.name === guide.subcommand)
      : definition;
    assert.ok(target, `Missing registered subcommand for ${guide.name}`);
    if (guide.subcommand) assert.equal(target.type, ApplicationCommandOptionType.Subcommand);
    assert.deepEqual(guide.options.map((option) => option.name), (target.options ?? []).map((option) => option.name));
    assert.ok(guide.usage.startsWith(`/${definition.name}`));
    for (const option of target.options ?? []) {
      const documentedOption = `${option.name}:<`;
      assert.ok(guide.usage.includes(option.required ? ` ${documentedOption}` : `[${documentedOption}`),
        `Check ${guide.name}'s ${option.name} usage`);
    }
    assert.ok(guide.examples.length > 0);
    assert.ok(guide.examples.every((example) => example.startsWith(`/${guide.name}`)));
  }
});

test("help overview and every guide reply privately without game API requests", async () => {
  await withMockFetch(async () => assert.fail("Help must not make game API requests"), async () => {
    for (const selection of [null, ...commandGuides.map((guide) => guide.name)]) {
      const reply = await getHelpReply(selection);
      assert.equal(reply.flags, MessageFlags.Ephemeral);
      assert.equal(JSON.stringify(reply.allowedMentions), '{"parse":[]}');
      assert.equal(reply.embeds.length, 1);
      const embed = reply.embeds[0].toJSON();
      assert.equal(embed.title, selection ? `Gambot — /${selection}` : "Gambot — Command Help");
    }
  });
});

test("the overview lists available commands and explains usernames, Premium, and cache limits", async () => {
  const reply = await getHelpReply();
  const embed = reply.embeds[0].toJSON();
  for (const guide of commandGuides) {
    assert.ok(embed.fields.some((field) => field.name === `/${guide.name}`));
  }
  const text = embedText(embed);
  assert.match(text, /require a Marvel Rivals username/);
  assert.match(text, /Seasonal and all-time ranks require API Premium access/);
  assert.match(text, /Hero proficiency also requires Premium/);
  assert.match(text, /Career stats \(overall and hero\) and proficiency cache for up to 3 minutes/);
  assert.match(text, /rank history, match history, and match details for 60 seconds/);
  assert.match(text, /Regular \/rank uses career data/);
  assert.match(text, /one hour/);
  assert.match(text, /Username searches are not cached/);
  assert.match(text, /does not guarantee the provider has updated/);
  assert.doesNotMatch(text, /\/account|\/refresh|\/status|\/patch/);
  assert.match(embed.footer.text, /Five-second cooldown per user and command/);
});

test("stats and rank guides explain season options and Premium limitations", () => {
  const stats = embedText(buildHelpEmbed("stats").toJSON());
  assert.match(stats, /9\.5/);
  assert.match(stats, /0\.5 does not exist/);
  assert.match(stats, /Omit season when using this option/);
  assert.match(stats, /Quick Play or Competitive/);
  assert.match(stats, /Omitted filters use API defaults/);
  assert.match(stats, /Hero proficiency requires API Premium access and is not filtered by season or mode/);
  assert.match(stats, /Only you can navigate, for two minutes/);

  const rank = embedText(buildHelpEmbed("rank").toJSON());
  assert.match(rank, /all-time:True/);
  assert.match(rank, /Seasonal and all-time ranks require API Premium access/);
  assert.match(rank, /latest profile rank without Premium rank history/);
  assert.match(rank, /Omit season when using this option/);
  assert.match(rank, /coverage depends on the provider/);
});

test("match guides explain full IDs, participant checks, history limits, and image permissions", () => {
  const history = embedText(buildHelpEmbed("history").toJSON());
  assert.match(history, /up to 20 recent matches/);
  assert.match(history, /older API pages are not fetched/);
  assert.match(history, /Details load as you open each match/);
  assert.match(history, /Attach Files permission/);
  assert.match(history, /full Match ID from the overview/);

  const match = embedText(buildHelpEmbed("match").toJSON());
  assert.match(match, /five groups of digits separated by underscores/);
  assert.match(match, /Short numeric replay codes are not supported/);
  assert.match(match, /player must have participated/);
  assert.match(match, /Replace the example's match ID placeholder/);
  assert.match(match, /without navigation/);
  assert.match(match, /Shares the match-detail cache with \/history/);
});

test("ping help distinguishes Discord latency from the game data service", () => {
  assert.match(embedText(buildHelpEmbed("ping").toJSON()), /Discord's gateway, not the Marvel Rivals data service/);
});

test("hero-stats help distinguishes performance from proficiency and explains fractional totals", () => {
  const text = embedText(buildHelpEmbed("hero-stats").toJSON());
  assert.match(text, /hero:<name> player:<username>/);
  assert.match(text, /season:9\.5 mode:Competitive/);
  assert.match(text, /Overview, Impact, and Personal Bests/);
  assert.match(text, /fractional because switching heroes splits match credit/);
  assert.match(text, /not Premium hero proficiency; no proficiency lookup is made/);
});

test("hero help explains the info subcommand, catalog data, and API limitations", () => {
  const text = embedText(buildHelpEmbed("hero").toJSON());
  assert.match(text, /\/hero info name:<name>/);
  assert.match(text, /role, real name, description, team-ups, catalog skin count/);
  assert.match(text, /Biography pages use Previous\/Next/);
  assert.match(text, /does not provide ability descriptions/);
  assert.match(text, /not skins owned by a player/);
});

test("compare help explains highlights, matching filters, neutral totals, and unavailable samples", () => {
  const text = embedText(buildHelpEmbed("compare").toJSON());
  assert.match(text, /player-a:<username> player-b:<username>/);
  assert.match(text, /Each full-width stat section shows both player names/);
  assert.match(text, /stronger value in bold beside a green indicator and a named lead/);
  assert.match(text, /Lower deaths per match is better/);
  assert.match(text, /matching season, mode, and platform filters/);
  assert.match(text, /totals and damage taken are not scored/);
  assert.match(text, /zero-match samples receive no winner/);
});

test("unknown selections offer the overview without echoing untrusted input", async () => {
  const reply = await getHelpReply("@everyone <@123456789> unknown");
  const text = embedText(reply.embeds[0].toJSON());
  assert.match(text, /Use `\/help` to see the available commands/);
  assert.doesNotMatch(text, /@everyone|123456789/);
});

test("every help embed fits Discord's field and total text limits", () => {
  for (const selection of [null, ...commandGuides.map((guide) => guide.name), "unknown"]) {
    const embed = buildHelpEmbed(selection).toJSON();
    assert.ok(embed.title.length <= 256);
    assert.ok(embed.description.length <= 4096);
    assert.ok(embed.footer.text.length <= 2048);
    assert.ok((embed.fields ?? []).length <= 25);
    let length = embed.title.length + embed.description.length + embed.footer.text.length;
    for (const field of embed.fields ?? []) {
      assert.ok(field.name.length > 0 && field.name.length <= 256);
      assert.ok(field.value.length > 0 && field.value.length <= 1024);
      length += field.name.length + field.value.length;
    }
    assert.ok(length <= 6000, `${selection ?? "overview"} exceeds the embed text limit`);
  }
});
