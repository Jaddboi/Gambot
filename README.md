# Gambot

A Discord bot for the University of Toronto Marvel Rivals community, built with
[discord.js](https://discord.js.org/) and the
[RivalsIsland API](https://api.rivalsisland.com/docs).

Gambot currently provides player stats in paginated embeds. Account linking,
match history, patch notes, and community tools are planned features.

## Available commands

| Command | What it does |
| --- | --- |
| `/ping` | Shows bot response time and Discord gateway latency. |
| `/stats player:<username> [season:<number>] [mode:<mode>]` | Looks up a Marvel Rivals username and displays paginated stats, optionally filtered by season and Quick Play or Competitive mode. |

### Season and mode filters

Enter a public season number such as `9` or `9.5`. Gambot looks up the available
seasons and sends the matching internal season ID to the career stats endpoint.
Unavailable selections, including `0.5`, are rejected before the player lookup.
Season `0` is accepted when it appears in the API's season list.

Choose **Quick Play** or **Competitive** for the optional mode. Omitting season
or mode leaves that filter at the API's default; this does not necessarily mean
all-time data or all modes.

```text
/stats player:Sypeh
/stats player:Sypeh season:9.5 mode:Competitive
```

### Player stats pages

- **Overview:** matches, wins, calculated win rate, playtime, account level, current
  rank, peak rank, rank score, and rank season.
- **Combat:** kills, deaths, assists, K/D and KDA ratios, kill streak, final hits,
  headshot kills, and solo kills.
- **Impact:** damage, healing, damage taken, MVP/SVP awards, and multikills.
- **Hero Proficiency:** hero level, rank, proficiency points, and points needed
  for the next level. Larger hero lists span multiple pages.

Only the person who ran the command can navigate its pages. Controls expire after
two minutes. Page changes reuse fetched data instead of making more API calls.
Missing data displays as unavailable rather than zero.

The command currently requires a username; linked-account defaults are planned.
Overview, Combat, and Impact pages display the season and mode filters returned
by the API. A matching selected season is shown by its public number; otherwise,
the label falls back to the returned season ID or API default season.
The rank season is displayed separately; do not assume it describes all career totals.
Account details and rank metadata are separate from the filtered career totals.
Hero proficiency comes from a separate endpoint and is not filtered by season or mode.

**Proficiency access:** RivalsIsland lists the player proficiency endpoint as
Premium-only. Gambot attempts that lookup and shows an availability explanation
if it fails; career stats remain usable.
[Provider documentation](https://api.rivalsisland.com/docs).

## Setup

You need Node.js and npm, a Discord application with a bot, and a RivalsIsland
API key. The project has been tested with Node.js **26.12.0**.

### 1. Install dependencies

```sh
git clone https://github.com/Jaddboi/Gambot.git
cd Gambot
npm ci
```

### 2. Configure local settings

Create a `.env` file in the project root and replace these placeholders locally:

```dotenv
BOT_TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_application_id
MARVEL_RIVALS_API_KEY=your_rivalsisland_api_key
MARVEL_RIVALS_API_BASE_URL=https://api.rivalsisland.com
```

| Setting | Used for |
| --- | --- |
| `BOT_TOKEN` | Bot login and command registration. |
| `CLIENT_ID` | The Discord application receiving registered commands. |
| `MARVEL_RIVALS_API_KEY` | Player data and season catalog requests. |
| `MARVEL_RIVALS_API_BASE_URL` | The API server, which must use HTTPS. |

Keep Discord IDs as strings. Keep real tokens and keys out of source code and
commits; `.env` files are excluded by `.gitignore`.

Optional presence settings:

| Setting | Default | Supported values |
| --- | --- | --- |
| `BOT_STATUS` | `online` | `online`, `idle`, `dnd`, `invisible` |
| `ACTIVITY_TYPE` | `PLAYING` | `PLAYING`, `WATCHING`, `LISTENING`, `STREAMING`, `COMPETING` |
| `ACTIVITY_NAME` | `Stats Tracker` | Activity text. |

### 3. Install the bot in a Discord server

Use your application's installation settings in the
[Discord Developer Portal](https://discord.com/developers/applications) to invite
the bot with the `bot` and `applications.commands` scopes. Allow it to view the
test channel, send messages, and embed links.

### 4. Register slash commands

```sh
node deploy-commands.js
```

Wait for `Successfully reloaded all commands!`. This script registers the command
definitions **globally**, replacing the application's global command list with
the definitions loaded from `commands/`.

### 5. Start the bot

```sh
npm start
```

Keep the process running and wait for the ready message. In Discord, try:

```text
/ping
/stats player:Sypeh
/stats player:Sypeh season:9.5 mode:Competitive
```

**Registration and startup are separate:** redeploy when command names,
descriptions, or options change. Restart the bot when execution code changes.
Changes can be tested locally before committing or merging a branch.

## Local checks

Run the automated tests:

```sh
npm test
```

Tests use mocked API requests, fake Discord interactions, and dummy configuration.
They do not load `.env` or require live Discord/API connections. Coverage includes
API errors, rate-limit timing, shared requests, stats formatting, proficiency,
pagination ownership, navigation expiry, season selection and labels, and season
catalog validation and cache expiry.

To make a real username and career-stats lookup without starting Discord, run:

```sh
node scripts/check-player.js "Player Name"
```

This script loads your local configuration and contacts RivalsIsland. Quotes keep
a username containing spaces together. It prints profile details, response
filters, and career stats; it does not fetch proficiency.

## How it works

```text
Registration: deploy-commands.js -> load command definitions -> Discord

Execution: Discord -> index.js -> interaction handler -> command.execute()
                                                           |
                                                           v
                                              player API lookup functions
                                                           |
                                                           v
                                              embed builders -> pagination
```

| Path | Responsibility |
| --- | --- |
| `index.js` | Starts the client, sets presence, and receives interactions. |
| `deploy-commands.js` | Registers slash command definitions. |
| `commands/` | Defines command options and execution. |
| `lib/load-commands.js` | Loads commands, validates exports, and rejects duplicate names. |
| `lib/handle-interaction.js` | Routes slash commands, applies cooldowns, and handles execution failures. |
| `lib/marvel-rivals-api/` | Player lookups, season catalog fetching, and shared HTTP request handling. |
| `lib/embeds/` | Builds player stats and proficiency pages. |
| `lib/paginate-embeds.js` | Handles message-scoped page navigation. |
| `lib/cache.js` | Stores completed results with expiry and a size limit. |
| `lib/cooldowns.js` | Tracks per-user, per-command cooldowns. |
| `scripts/` | Standalone local utilities. |
| `test/` | Automated tests. |

### Request controls

- Commands have a **five-second cooldown per user and command**.
- Career and proficiency results are cached for **60 seconds**. Season lists are
  cached for **one hour**. All three use a shared **100-entry cache limit**.
  Career cache keys include the season and mode filters, so different selections
  use separate entries. Username search and basic profile lookup are not cached.
- Identical pending career/proficiency lookups share their respective request,
  including response validation. Failed lookups are removed so they can be retried.
- HTTP requests have a **10-second timeout**. After a `429`, requests to that
  API origin are blocked locally until the retry deadline. The client respects
  retry headers, using a one-second fallback when neither supplies a valid delay.
  It does not automatically retry failed requests.

These controls live in memory and reset on restart. They are not shared between
processes. Cache freshness describes Gambot's stored response, not a guarantee
that the provider has updated the underlying game data. No database is currently used.

## Planned commands

These are roadmap items, not currently available commands. Provider support and
access requirements will be checked as each feature is implemented.

| Area | Planned commands and behavior |
| --- | --- |
| Saved accounts | `/account link uid`, `/account unlink`. Save an association with a Discord account; this does not verify ownership. |
| Expanded stats | Linked-account defaults for an omitted player and most-played hero performance in `/stats`; season and mode filters are already available. |
| Rank | `/rank [player] [season]` for current/peak rank and available progression. |
| Matches | `/history [player] [mode]` and `/match player match-id` for paginated history and detailed match cards. |
| Hero performance | `/player-hero hero [player] [season]` and `/compare player-a player-b [hero]`, using consistent season/mode settings. |
| Refresh | `/refresh [player]` to request updates and show the refresh cooldown. |
| Patch notes | `/patch latest`, `/patch list`. |
| Balance changes | `/balance latest [hero]`, `/balance search query`. |
| Hero information | `/hero info name` for role, abilities, and details. |
| Leaderboards | `/leaderboard server [metric] [season]` for opted-in members, with a minimum match count for win-rate rankings; `/leaderboard hero hero` where supported. |
| Group finding | `/lfg create`, `/lfg list`, `/lfg join`, `/lfg leave`, `/lfg close`. |
| Profiles | `/profile edit` for roles, mains, availability, and optional UTSG/UTM/UTSC campus. |
| Events and teams | `/event create`, `/event list`, `/event rsvp`, `/teams balance`. |
| Privacy | `/privacy leaderboard on\|off`, `/privacy delete` for stored associations, preferences, and retained personal stats. |
| Server administration | `/config announcements channel`, `/config roles`; rank roles need trustworthy account verification. |
| Help and status | `/help [command]`, `/status`. |

## Development workflow

Build each feature on a separate branch from the latest `main`, then commit,
push, and open a pull request. Merge reviewed changes before starting the next
dependent feature.

```sh
git switch main
git pull --ff-only
git switch -c feat/your-feature
```

Run `npm test` for relevant changes. Keep command definitions, execution, API
requests, and embed formatting in their respective modules.
