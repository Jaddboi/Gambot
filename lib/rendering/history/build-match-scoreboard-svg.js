// Draws both teams in one scoreboard with shared columns and separate colored team headers.
const { formatMatchNumber, formatAccuracy } = require("../../formatting/numbers");
const { getMostPlayedHero, getHeroIconUrl, formatTeamTitle, sortPlayersByKills } = require("../../embeds/history/match-formatting");
const { getRankIconUrl, formatShortRank } = require("../../formatting/ranks");

const WIDTH = 1440;
const ROW_HEIGHT = 82;
const COLUMN_HEADER_HEIGHT = 50;
const TEAM_HEADER_HEIGHT = 62;
const MAX_VISIBLE_PLAYERS = 12;
const COLORS = { text: "#f3f3f3", muted: "#999b9d", win: "#57c879", loss: "#f08389", neutral: "#929eff" };

function escapeXml(value) {
  return String(value).replace(/[\x00-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);
}

function shorten(value, limit) {
  const text = typeof value === "string" && value.trim() ? value.trim() : "Unavailable";
  const characters = [...text];
  return characters.length > limit ? characters.slice(0, limit - 1).join("") + "…" : text;
}

function text(x, y, value, { size = 26, color = COLORS.text, weight = 400, anchor = "start" } = {}) {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}" text-anchor="${anchor}">${escapeXml(value)}</text>`;
}

function inlineImage(images, url, x, y, size, clipId = null) {
  const data = images.get(url);
  // Never let the SVG renderer resolve remote URLs, local paths, or nested SVGs.
  if (typeof data !== "string" || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(data)) return "";
  const clip = clipId ? ` clip-path="url(#${clipId})"` : "";
  return `<image href="${data}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"${clip}/>`;
}

function signedNumber(value) {
  if (!Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toLocaleString("en-CA", { maximumFractionDigits: 1 })}`;
}

function averageLabel(players) {
  if (players.length === 0) return "Average rank score unavailable";
  const scores = players.map((player) => player.rank?.after?.rank_score);
  if (!scores.every((score) => Number.isFinite(score) && score >= 0)) return "Average rank score unavailable";
  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const changes = players.map((player) => player.rank?.change);
  const change = changes.every(Number.isFinite)
    ? ` · Δ ${signedNumber(changes.reduce((sum, value) => sum + value, 0) / changes.length)}` : "";
  return `Avg score ${Math.round(average).toLocaleString("en-CA")}${change}`;
}

function playerRow(player, index, selectedUid, images, rowStartY, teamIndex) {
  const y = rowStartY + index * ROW_HEIGHT;
  const rowId = `${teamIndex}-${index}`;
  const isSelected = player.uid === selectedUid;
  const background = isSelected ? "#303027" : index % 2 === 0 ? "#252626" : "#202121";
  const hero = getMostPlayedHero(player);
  const nameLimit = player.mvp || player.svp ? 14 : 18;
  const name = shorten(player.name, nameLimit);
  const heroName = shorten(hero?.name, 24);
  const rank = player.rank?.after;
  const change = player.rank?.change;
  const changeColor = change > 0 ? COLORS.win : change < 0 ? COLORS.loss : COLORS.muted;
  const kda = [player.kills, player.deaths, player.assists].map((value) => formatMatchNumber(value)).join(" / ");
  const heroImage = inlineImage(images, getHeroIconUrl(hero), 20, y + 16, 50, `hero-${rowId}`);
  const rankImage = inlineImage(images, getRankIconUrl(rank?.rank), 340, y + 23, 34);
  const parts = [
    `<rect x="0" y="${y}" width="${WIDTH}" height="${ROW_HEIGHT}" fill="${background}"/>`,
    `<clipPath id="hero-${rowId}"><rect x="20" y="${y + 16}" width="50" height="50" rx="6"/></clipPath>`,
    `<clipPath id="name-${rowId}"><rect x="86" y="${y}" width="${player.mvp || player.svp ? 178 : 243}" height="${ROW_HEIGHT}"/></clipPath>`,
    `<clipPath id="rank-${rowId}"><rect x="382" y="${y}" width="102" height="${ROW_HEIGHT}"/></clipPath>`,
    `<rect x="20" y="${y + 16}" width="50" height="50" rx="6" fill="#363838"/>`,
    heroImage || text(45, y + 49, shorten(hero?.name, 2), { size: 19, anchor: "middle", color: COLORS.muted }),
    `<g clip-path="url(#name-${rowId})">`,
    text(86, y + 36, name, { size: 24, color: isSelected ? "#ffd457" : COLORS.text, weight: 700 }),
    text(86, y + 62, heroName, { size: 16, color: COLORS.muted }),
    "</g>",
    rankImage,
    `<g clip-path="url(#rank-${rowId})">`,
    text(382, y + 37, formatShortRank(rank?.rank), { size: 24, weight: 700 }),
    text(382, y + 62, Number.isFinite(rank?.rs) ? `${rank.rs.toLocaleString("en-CA", { maximumFractionDigits: 1 })} RS` : "— RS", { size: 17, color: COLORS.muted }),
    "</g>",
    text(520, y + 49, signedNumber(change), { size: 20, color: changeColor, anchor: "end" }),
    text(647, y + 49, kda, { anchor: "middle" }),
    text(790, y + 49, formatMatchNumber(player.final_hits), { anchor: "middle" }),
    text(925, y + 49, formatMatchNumber(player.damage, true), { anchor: "middle" }),
    text(1055, y + 49, formatMatchNumber(player.damage_taken, true), { anchor: "middle" }),
    text(1190, y + 49, formatMatchNumber(player.healing, true), { anchor: "middle" }),
    text(1350, y + 49, formatAccuracy(player.accuracy), { anchor: "middle" }),
  ];
  if (isSelected) parts.push(`<rect x="0" y="${y}" width="4" height="${ROW_HEIGHT}" fill="#ffd457"/>`);
  const award = player.mvp === true ? "MVP" : player.svp === true ? "SVP" : null;
  if (award) {
    const awardColor = award === "MVP" ? "#e9bb3c" : "#b8babe";
    parts.push(`<rect x="275" y="${y + 17}" width="51" height="24" rx="6" fill="${award === "MVP" ? "#4b4226" : "#3d3f40"}"/>`);
    parts.push(text(300, y + 35, award, { size: 16, color: awardColor, anchor: "middle", weight: 700 }));
  }
  return parts.join("");
}

function visiblePlayers(team, selectedUid) {
  const sortedPlayers = sortPlayersByKills(team.players);
  const players = sortedPlayers.slice(0, MAX_VISIBLE_PLAYERS);
  // Keep the searched player visible even when an unusual roster needs truncation.
  const selected = sortedPlayers.find((player) => player.uid === selectedUid);
  if (selected && !players.includes(selected)) players[players.length - 1] = selected;
  return players;
}

function buildMatchScoreboardSvg(teams, selectedUid, images = new Map()) {
  const groups = teams.map((team) => ({ team, players: visiblePlayers(team, selectedUid) }));
  const height = COLUMN_HEADER_HEIGHT + groups.reduce((total, { team, players }) => {
    const noteHeight = players.length < team.players.length ? 42 : 0;
    return total + TEAM_HEADER_HEIGHT + players.length * ROW_HEIGHT + noteHeight;
  }, 0) + 12;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" font-family="Noto Sans">`,
    `<rect width="${WIDTH}" height="${height}" rx="12" fill="#202121"/>`,
  ];
  const headers = [[20, "PLAYER", "start"], [340, "RANK", "start"], [647, "K / D / A", "middle"],
    [790, "FINALS", "middle"], [925, "DMG", "middle"], [1055, "TAKEN", "middle"],
    [1190, "HEALING", "middle"], [1350, "ACC", "middle"]];
  for (const [x, label, anchor] of headers) parts.push(text(x, 34, label, { size: 21, color: COLORS.muted, weight: 700, anchor }));

  let teamStartY = COLUMN_HEADER_HEIGHT;
  groups.forEach(({ team, players }, teamIndex) => {
    const resultColor = COLORS[team.result] ?? COLORS.neutral;
    const title = formatTeamTitle(team);
    const background = team.result === "win" ? "#29372b" : team.result === "loss" ? "#402d2f" : "#2c3041";
    parts.push(`<rect x="0" y="${teamStartY}" width="${WIDTH}" height="${TEAM_HEADER_HEIGHT}" fill="${background}"/>`);
    parts.push(text(20, teamStartY + 41, title, { size: 28, color: resultColor, weight: 700 }));
    parts.push(text(WIDTH - 20, teamStartY + 40, averageLabel(team.players), { size: 23, anchor: "end", color: COLORS.muted }));
    const rowStartY = teamStartY + TEAM_HEADER_HEIGHT;
    players.forEach((player, index) => parts.push(playerRow(player, index, selectedUid, images, rowStartY, teamIndex)));
    teamStartY = rowStartY + players.length * ROW_HEIGHT;
    if (players.length < team.players.length) {
      parts.push(text(20, teamStartY + 29, `${players.length}/${team.players.length} players shown`, { size: 18, color: COLORS.muted }));
      teamStartY += 42;
    }
  });
  parts.push("</svg>");
  return parts.join("");
}

module.exports = { buildMatchScoreboardSvg };
