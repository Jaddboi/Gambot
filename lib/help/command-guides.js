// Describes available commands, examples, and limitations for the help menu.
const commandGuides = [
  {
    name: "ping",
    summary: "Check bot response time and Discord gateway latency.",
    usage: "/ping",
    options: [],
    examples: ["/ping"],
    notes: "The API latency shown here measures Discord's gateway, not the Marvel Rivals data service.",
  },
  {
    name: "stats",
    summary: "Browse career stats and hero proficiency pages.",
    usage: "/stats player:<username> [season:<number>] [all-seasons:<boolean>] [mode:<mode>]",
    options: [
      { name: "player", description: "Required Marvel Rivals username; saved accounts are not available yet." },
      { name: "season", description: "Optional public season number, such as 9 or 9.5. Only available seasons are accepted; 0.5 does not exist." },
      { name: "all-seasons", description: "Set True for career totals across all seasons. Omit season when using this option." },
      { name: "mode", description: "Optional Quick Play or Competitive filter." },
    ],
    examples: [
      "/stats player:Sypeh",
      "/stats player:Sypeh season:9.5 mode:Competitive",
      "/stats player:Sypeh all-seasons:True",
    ],
    notes: "Pages include Overview, Combat, Impact, and Hero Proficiency. Only you can navigate, for two minutes.\n"
      + "Hero proficiency requires API Premium access and is not filtered by season or mode; career pages remain usable if it is unavailable.\n"
      + "Omitted filters use API defaults. All-season coverage depends on the provider. Rank metadata has its own reported season.",
  },
  {
    name: "hero-stats",
    summary: "Browse one player's career performance on a specific hero.",
    usage: "/hero-stats hero:<name> player:<username> [season:<number>] [mode:<mode>]",
    options: [
      { name: "hero", description: "Required full hero name. Capitalization, spaces, and punctuation are ignored; incomplete names receive suggestions when available." },
      { name: "player", description: "Required Marvel Rivals username." },
      { name: "season", description: "Optional public season number, such as 9 or 9.5. Only available seasons are accepted; 0.5 does not exist." },
      { name: "mode", description: "Optional Quick Play or Competitive filter." },
    ],
    examples: [
      "/hero-stats hero:Spider-Man player:Sypeh",
      "/hero-stats hero:Iron Man player:Sypeh season:9.5 mode:Competitive",
    ],
    notes: "Pages show Overview, Impact, and Personal Bests. Only you can navigate, for two minutes. Zero reported matches produces one overview.\n"
      + "Hero matches and wins can be fractional because switching heroes splits match credit. Missing data is unavailable, not zero.\n"
      + "Omitted filters use API defaults. These are hero career stats, not Premium hero proficiency; no proficiency lookup is made.",
  },
  {
    name: "compare",
    summary: "Compare two players and highlight stronger performance values.",
    usage: "/compare player-a:<username> player-b:<username> [hero:<name>] [season:<number>] [mode:<mode>]",
    options: [
      { name: "player-a", description: "Required first player's Marvel Rivals username." },
      { name: "player-b", description: "Required second player's Marvel Rivals username; must be a different player." },
      { name: "hero", description: "Optional full hero name to compare that character instead of overall career stats." },
      { name: "season", description: "Optional shared public season number, such as 9 or 9.5. Only available seasons are accepted." },
      { name: "mode", description: "Optional shared Quick Play or Competitive filter." },
    ],
    examples: [
      "/compare player-a:Sypeh player-b:wewantmikey",
      "/compare player-a:Sypeh player-b:wewantmikey hero:Spider-Man season:9.5 mode:Competitive",
    ],
    notes: "Each full-width stat section shows both player names, with the stronger value in bold beside a green indicator and a named lead underneath. Ties use displayed precision. Lower deaths per match is better. Percentage differences use percentage points.\n"
      + "Pages show Performance, Impact, and neutral Totals & Playtime. Damage/healing use rates per ten minutes; totals and damage taken are not scored.\n"
      + "Both responses must confirm matching season, mode, and platform filters. Omitted filters use API defaults. Missing values and zero-match samples receive no winner.\n"
      + "Only you can navigate, for two minutes. Requests run sequentially; rate limits can trigger one retry per operation with a wait up to ten seconds. Uses cached career/hero stats without Premium lookups.",
  },
  {
    name: "rank",
    summary: "Show the latest rank, seasonal ranks, or highest reported peak.",
    usage: "/rank player:<username> [season:<number>] [all-time:<boolean>]",
    options: [
      { name: "player", description: "Required Marvel Rivals username." },
      { name: "season", description: "Optional public season number, such as 9 or 9.5. Only available seasons are accepted." },
      { name: "all-time", description: "Set True for the highest reported peak across available seasons and platforms. Omit season when using this option." },
    ],
    examples: [
      "/rank player:Sypeh",
      "/rank player:Sypeh season:9.5",
      "/rank player:Sypeh all-time:True",
    ],
    notes: "Seasonal and all-time ranks require API Premium access. The regular command uses the latest profile rank without Premium rank history.\n"
      + "Seasonal results can include separate platform cards. All-time compares reported peaks by rank level, then score; coverage depends on the provider.",
  },
  {
    name: "history",
    summary: "Browse recent matches with detailed team scoreboards.",
    usage: "/history player:<username> [mode:<mode>]",
    options: [
      { name: "player", description: "Required Marvel Rivals username." },
      { name: "mode", description: "Optional Quick Play or Competitive filter. Omit it to request history without a mode filter." },
    ],
    examples: ["/history player:Sypeh", "/history player:Sypeh mode:Competitive"],
    notes: "Requests up to 20 recent matches. Only you can use Previous/Next, for two minutes; older API pages are not fetched.\n"
      + "Details load as you open each match. The overview and combined scoreboard show both teams, one hero per player, and your selected player highlighted.\n"
      + "Scoreboard images need Attach Files permission. Rendering failures use text tables; unavailable details use a summary. Copy the full Match ID from the overview for /match.",
  },
  {
    name: "match",
    summary: "Open one match directly using its full Match ID.",
    usage: "/match player:<username> match-id:<full-match-id>",
    options: [
      { name: "player", description: "Required Marvel Rivals username of a participant in the match." },
      { name: "match-id", description: "Required full Match ID copied from a /history overview: five groups of digits separated by underscores. Short numeric replay codes are not supported." },
    ],
    examples: ["/match player:Sypeh match-id:<full-match-id-from-history>"],
    notes: "Replace the example's match ID placeholder with the full ID from /history. The player must have participated, and the match must be available from the API.\n"
      + "Shows one overview and a combined team scoreboard, without navigation. Images need Attach Files permission; rendering failures use text tables. Shares the match-detail cache with /history.",
  },
  {
    name: "help",
    summary: "Find command usage, examples, and data limitations.",
    usage: "/help [command:<name>]",
    options: [
      { name: "command", description: "Optional command to explain. Omit it for the command overview." },
    ],
    examples: ["/help", "/help command:stats", "/help command:match"],
    notes: "Help is visible only to you. It uses local descriptions and makes no game API requests. Only implemented commands appear in this menu.",
  },
];

module.exports = { commandGuides };
