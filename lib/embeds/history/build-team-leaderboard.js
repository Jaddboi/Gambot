// Builds one named team leaderboard table, keeping its text within the match-card budget.
const { EmbedBuilder } = require("discord.js");
const { formatMatchNumber } = require("../../formatting/numbers");
const { getResultColor, getMostPlayedHero } = require("./match-formatting");

const TABLE_COLUMN_WIDTHS = [14, 9, 3, 6, 6, 6, 4];
const TEAM_TABLE_CHARACTER_LIMIT = 2000;

function accuracy(value) {
  const isValid = Number.isFinite(value) && value >= 0 && value <= 1;
  return isValid ? `${Math.round(value * 100)}%` : "—";
}

function teamTitle(team) {
  const outcome = team.result ? ` · ${team.result.toUpperCase()}` : "";
  const score = Number.isFinite(team.score) ? ` · Score ${team.score}` : "";
  return `${team.label}${outcome}${score}`;
}

function tableText(value, limit) {
  const label = typeof value === "string" && value.trim() !== "" ? value : "Unavailable";
  // Code blocks do not escape Markdown; remove backticks and invisible/control characters.
  const clean = label.replace(/[`\x00-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ").trim();
  const characters = [...clean];
  return characters.length > limit ? characters.slice(0, limit - 1).join("") + "…" : clean;
}

function tableRow(values) {
  return values.map((value, index) => {
    const cell = tableText(String(value), TABLE_COLUMN_WIDTHS[index]);
    const padding = " ".repeat(TABLE_COLUMN_WIDTHS[index] - [...cell].length);
    return index === 0 ? cell + padding : padding + cell;
  }).join(" ");
}

function playerRows(player, selectedUid) {
  const name = `${player.uid === selectedUid ? "> " : ""}${player.name ?? "Unavailable"}`;
  const kda = `${formatMatchNumber(player.kills)}/${formatMatchNumber(player.deaths)}/${formatMatchNumber(player.assists)}`;
  const stats = tableRow([
    name, kda, formatMatchNumber(player.final_hits), formatMatchNumber(player.damage, true),
    formatMatchNumber(player.damage_taken, true), formatMatchNumber(player.healing, true), accuracy(player.accuracy),
  ]);
  const award = player.mvp === true ? " [MVP]" : player.svp === true ? " [SVP]" : "";
  const hero = tableText(getMostPlayedHero(player)?.name, 38);
  return `${stats}\n  ${hero}${award}`;
}

function buildTeamLeaderboard(team, selectedUid) {
  const players = [...team.players].sort((a, b) => {
    const killsA = Number.isFinite(a.kills) && a.kills >= 0 ? a.kills : -1;
    const killsB = Number.isFinite(b.kills) && b.kills >= 0 ? b.kills : -1;
    return killsB - killsA;
  });
  const lines = [tableRow(["PLAYER", "K/D/A", "F", "DMG", "TAKEN", "HEAL", "ACC"])];
  let shown = 0;
  let tableLength = lines[0].length;
  for (const player of players) {
    const rows = playerRows(player, selectedUid);
    // Reserve a fixed text budget for each of the two team cards.
    if (tableLength + rows.length + 1 > TEAM_TABLE_CHARACTER_LIMIT) break;
    lines.push(rows);
    tableLength += rows.length + 1;
    shown++;
  }
  const note = shown < players.length ? ` • ${shown}/${players.length} players shown` : "";
  return new EmbedBuilder()
    .setColor(getResultColor(team.result))
    .setTitle(teamTitle(team))
    .setDescription("```text\n" + lines.join("\n") + "\n```")
    .setFooter({ text: `Sorted by kills • > selected player • F: final hits • TAKEN: damage taken${note}` });
}

module.exports = { buildTeamLeaderboard };
