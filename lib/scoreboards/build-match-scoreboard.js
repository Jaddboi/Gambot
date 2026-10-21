// Builds a match overview and one readable text leaderboard per team.
const { EmbedBuilder, escapeMarkdown } = require("discord.js");

const resultColors = { win: 0x57c879, loss: 0xf08389, draw: 0x718bfc, abandoned: 0x718bfc };

function formatText(value, limit = 40) {
  if (typeof value !== "string" || value.trim() === "") return "Unavailable";
  return escapeMarkdown(value.trim().replace(/[\r\n\t]/g, " ").slice(0, limit));
}

function formatNumber(value, compact = false) {
  if (!Number.isFinite(value) || value < 0) return "—";
  if (value >= 1_000_000_000) return value.toExponential(1);
  if (compact && value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toLocaleString("en-CA", { maximumFractionDigits: 1 });
}

function mainHero(player) {
  let selected = null;
  for (const hero of player.heroes) {
    if (!selected || (hero.play_time?.seconds ?? 0) > (selected.play_time?.seconds ?? 0)) {
      selected = hero;
    }
  }
  return selected;
}

function heroIconUrl(hero) {
  if (typeof hero?.icon !== "string" || hero.icon.length > 2048) return null;
  try {
    const url = new URL(hero.icon);
    const isTrusted = url.protocol === "https:" && url.hostname === "assets.rivalsisland.com" &&
      url.username === "" && url.password === "" && url.port === "";
    return isTrusted ? url.href : null;
  } catch {
    return null;
  }
}

function accuracy(value) {
  const isValid = Number.isFinite(value) && value >= 0 && value <= 1;
  return isValid ? `${Math.round(value * 100)}%` : "—";
}

function teamGroups(match) {
  if (match.teams.length === 0) return [{ label: "Participants", players: match.players }];
  const teams = new Map(match.teams.map((team) => [team.id, { ...team, label: `Team ${team.id}`, players: [] }]));
  for (const player of match.players) {
    if (!teams.has(player.team_id)) {
      teams.set(player.team_id, { label: `Team ${player.team_id}`, players: [] });
    }
    teams.get(player.team_id).players.push(player);
  }
  const order = { win: 0, draw: 1, loss: 2, abandoned: 3 };
  return [...teams.values()].filter((team) => team.players.length > 0)
    .sort((a, b) => (order[a.result] ?? 4) - (order[b.result] ?? 4));
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
  const widths = [14, 9, 3, 6, 6, 6, 4];
  return values.map((value, index) => {
    const cell = tableText(String(value), widths[index]);
    const padding = " ".repeat(widths[index] - [...cell].length);
    return index === 0 ? cell + padding : padding + cell;
  }).join(" ");
}

function playerRows(player, selectedUid) {
  const name = `${player.uid === selectedUid ? "> " : ""}${player.name ?? "Unavailable"}`;
  const kda = `${formatNumber(player.kills)}/${formatNumber(player.deaths)}/${formatNumber(player.assists)}`;
  const stats = tableRow([
    name, kda, formatNumber(player.final_hits), formatNumber(player.damage, true),
    formatNumber(player.damage_taken, true), formatNumber(player.healing, true), accuracy(player.accuracy),
  ]);
  const award = player.mvp === true ? " [MVP]" : player.svp === true ? " [SVP]" : "";
  const hero = tableText(mainHero(player)?.name, 38);
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
  for (const player of players) {
    const rows = playerRows(player, selectedUid);
    // Reserve a fixed text budget for each of the two team cards.
    if (lines.join("\n").length + rows.length + 1 > 2000) break;
    lines.push(rows);
    shown++;
  }
  const note = shown < players.length ? ` • ${shown}/${players.length} players shown` : "";
  return new EmbedBuilder()
    .setColor(resultColors[team.result] ?? 0x718bfc)
    .setTitle(teamTitle(team))
    .setDescription("```text\n" + lines.join("\n") + "\n```")
    .setFooter({ text: `Sorted by kills • > selected player • F: final hits • TAKEN: damage taken${note}` });
}

function buildMatchScoreboard(player, match, index, matchCount) {
  const participant = match.players.find((entry) => entry.uid === player.uid);
  if (!participant) throw new Error("The selected player is not in this match.");
  const hero = mainHero(participant);
  const change = participant.rank?.change;
  const rankChange = Number.isFinite(change) ? `${change > 0 ? "+" : ""}${change}` : "Unavailable";
  const overview = new EmbedBuilder()
    .setColor(resultColors[participant.result] ?? 0x718bfc)
    .setTitle(`${formatText(player.name)} — Match History`)
    .setDescription([
      `Result: **${participant.result}** · Rank change: **${rankChange}**`,
      `**${formatText(match.category?.name)}** · Hero: **${formatText(hero?.name)}**`,
      `Match ID: \`${match.match_uid}\``,
    ].join("\n"))
    .addFields(
      { name: "Map", value: formatText(match.map?.name), inline: true },
      { name: "Mode", value: formatText(match.game_mode), inline: true },
      { name: "Duration", value: formatText(match.duration?.formatted), inline: true },
      { name: "Kills", value: formatNumber(participant.kills), inline: true },
      { name: "Deaths", value: formatNumber(participant.deaths), inline: true },
      { name: "Assists", value: formatNumber(participant.assists), inline: true }
    )
    .setTimestamp(new Date(match.played_at));
  const iconUrl = heroIconUrl(hero);
  if (iconUrl) overview.setThumbnail(iconUrl);

  overview.setFooter({
    text: `Match ${index + 1} / ${matchCount} • UID: ${player.uid} • ➜ selected player • — unavailable`,
  });

  const groups = teamGroups(match);
  const teams = groups.slice(0, 2);
  const selectedTeam = groups.find((team) => team.players.some((entry) => entry.uid === player.uid));
  if (selectedTeam && !teams.includes(selectedTeam)) teams[teams.length - 1] = selectedTeam;
  const leaderboards = teams.map((team) => buildTeamLeaderboard(team, player.uid));
  if (groups.length > 2) {
    overview.setFooter({ text: `${overview.data.footer.text} • Showing 2/${groups.length} teams` });
  }
  return [overview, ...leaderboards];
}

module.exports = { buildMatchScoreboard };
