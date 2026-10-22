# Gambot

A Discord bot for the University of Toronto Marvel Rivals community, built with
[discord.js](https://discord.js.org/) and the
[RivalsIsland API](https://api.rivalsisland.com/docs).

Gambot currently provides player stats, rank lookups, recent match history, and
standalone match scoreboards. Account linking, patch notes, and community tools
are planned features.

## Available commands

| Command | What it does |
| --- | --- |
| `/ping` | Shows bot response time and Discord gateway latency. |
| `/stats player:<username> [season:<number>] [all-seasons:<boolean>] [mode:<mode>]` | Looks up a Marvel Rivals username and displays paginated stats for one season or all seasons, optionally filtered to Quick Play or Competitive. |
| `/rank player:<username> [season:<number>] [all-time:<boolean>]` | Shows the latest reported rank, a selected season's ranks, or the highest reported peak across available seasons. Seasonal and all-time lookups require API Premium access. |
| `/history player:<username> [mode:<mode>]` | Automatically shows a full scoreboard for each opened match, including both teams, heroes, combat stats, and a highlighted player. |
| `/match player:<username> match-id:<full-match-id>` | Opens one match directly, showing its overview and combined scoreboard from the selected player's perspective. |
| `/help [command:<name>]` | Privately explains available commands, options, examples, Premium access, and data freshness. |

### Command help

Use `/help` for the available command list or select a command for its full guide:

```text
/help
/help command:stats
/help command:match
```

Replies are visible only to you and make no game API requests. The menu explains
required usernames, optional season/mode filters, Premium-only features, full
match IDs, navigation limits, and cache freshness. The usual five-second
per-user, per-command cooldown still applies.

### Season and mode filters

Enter a public season number such as `9` or `9.5`. Gambot looks up the available
seasons and sends the matching internal season ID to the career stats endpoint.
Unavailable selections, including `0.5`, are rejected before the player lookup.
Season `0` is accepted when it appears in the API's season list.

Select **all-seasons:True** to request career totals without a season filter.
Use either `season` or `all-seasons:True` in a command. The career pages show
**All seasons** when the API confirms `filters.season` is `null`; if it returns
a specific season or omits that confirmation, the bot explains that the result
could not be confirmed rather than presenting it as all-season totals.
This uses the provider's unfiltered career response without making a request
for each individual season. Its historical coverage depends on the provider.

Choose **Quick Play** or **Competitive** for the optional mode. Omitting season
or mode leaves that filter at the API's default; this does not necessarily mean
all-time data or all modes.

```text
/stats player:Sypeh
/stats player:Sypeh season:9.5 mode:Competitive
/stats player:Sypeh all-seasons:True mode:Competitive
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

### Player ranks

```text
/rank player:Sypeh
/rank player:Sypeh season:9.5
/rank player:Sypeh all-time:True
```

Without either option, `/rank` shows the latest profile rank and its reported
season, using the career endpoint. A selected season uses the dedicated
`/players/{uid}/rank-history` endpoint after resolving the public number to its
catalog ID. It never substitutes the latest profile rank for missing history.
If that season has separate PC, PlayStation, and Xbox ranks, each gets a card.

Use **all-time:True** to show the highest reported peak across the seasons and
platforms returned by rank history. Use either `season` or `all-time:True`.
Peaks are compared by rank level, with score breaking ties at the same level.
The card shows that peak's score, season, platform, and the number of distinct
seasons returned. It does not sum scores or infer peaks from final ranks.
Missing data stays unavailable; historical coverage depends on the provider.

Rank cards display the matching tier badge as a thumbnail. Regular cards use the
current or selected-season rank; the all-time card uses the selected peak rank.
Numeric and Roman divisions share the tier badge. Unknown or unranked values
have no icon. Discord loads the provider's public images directly, without an
extra authenticated lookup. [Badge catalog](https://rivalsisland.com/data/game-data.json).

RivalsIsland documents rank history as **Premium-only, 5 credits per request**,
in addition to username lookup. Selecting a season also requires a season catalog
lookup when that catalog is not cached. These options cannot bypass the API's
access restrictions. [Provider documentation](https://api.rivalsisland.com/docs#players).

### Recent match history

```text
/history player:Sypeh
/history player:Sypeh mode:Competitive
```

The username is required. The optional mode selects **Quick Play** or
**Competitive**; omitted mode adds no category filter to the API request.
Standard two-team matches show **two cards**: the existing overview and one
combined scoreboard image containing both teams under a shared column header.
The searched player's team appears first, even after a loss. Images use alternating
dark rows, green/red result headers, hero portraits, rank badges, MVP/SVP labels,
and a gold highlight for the searched player. Columns show player, rank, K/D/A,
final hits, damage, damage taken, healing, and accuracy. Each player uses one hero
(the most time played); rows are sorted by kills. Open an image for the full-size view.

Ranks come from the match's **after-match** rank data, with the reported RS and
signed score change. Team average score and average change appear only when all
team members have the corresponding data. These use the match-detail response
without extra Premium rank-history requests. Missing ranks remain unavailable.
Damage taken stays labeled **TAKEN**; it is not damage blocked.

Previous/Next controls are available only to the invoking user for two minutes.
Full details load only for the visible match. Opened cards and rendered PNGs are
reused during that view, so returning to a match does not make another detail
request or render it again. Page changes replace the old image attachments, and
control expiry preserves the existing uploads. Each uncached match-detail lookup costs **5 API credits** under
the [provider's documented pricing](https://api.rivalsisland.com/docs#matches),
in addition to username/history requests.

If rendering fails, the command keeps the overview and falls back to native text
tables. If full match details cannot load, it shows the existing match summary
with available rank changes and K/D/A. Missing stats display as unavailable
rather than zero. Failed portrait/badge downloads use placeholders and do not
prevent rendering. Only trusted provider PNGs are downloaded, without API keys
or redirects, with a two-second total download budget and six concurrent requests.
Images are limited to 512 KiB and 2048 pixels per dimension and cached separately
for one day, with at most 64 cached images. The overview thumbnail remains native.

The renderer uses `@resvg/resvg-js` and bundled Noto Sans fonts under the
[SIL Open Font License](assets/fonts/OFL.txt). Font sources are from
[Noto Fonts](https://github.com/notofonts/noto-fonts).
Long names are clipped to their columns. Images show at most 12 players per team
with a truncation notice and retain the searched player when present. More than
two teams are shortened with a notice. Individual modes show one participant
scoreboard rather than inventing a second team.

The command currently requests **API page 0 with a page size of 20**. The provider
can return fewer matches, including an empty page. Buttons navigate only those
returned matches and do not fetch older history pages. An empty-page message
does not mean the player has never played. Use `/match` to open one available
match directly by its full match ID.

### Standalone match lookup

```text
/match player:Sypeh match-id:<full-match-id-from-history>
```

Both options are required. Copy the **Match ID** printed in a `/history` overview
and replace the placeholder above. The full API match ID contains five groups
of digits separated by underscores. Short numeric replay codes shown on other
sites are not supported. Invalid IDs are rejected before any API requests.

The command searches the username, fetches that exact match, and checks the
player's UID against its participants. Missing players, missing matches, and
players who did not participate receive an explanation. It does not fetch the
player's history first or require the match to be on the newest history page;
availability still depends on the API.

The reply shows a **Match Details** overview and the same combined team
scoreboard used by `/history`, including the selected-player highlight. A single
match has no navigation buttons or history page numbering. Rendering failures
use the existing text-table fallback. The bot needs **Attach Files** permission
to display the rendered image.

Match details use the same 60-second cache as `/history`. An uncached match
request has the existing match-detail credit cost, in addition to username
lookup; `/match` does not make a separate history request.

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
test channel, send messages, embed links, and **attach files** for scoreboard images.

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
/help
/stats player:Sypeh
/stats player:Sypeh season:9.5 mode:Competitive
/history player:Sypeh mode:Competitive
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
`npm test` runs the `test/*.test.js` files; support files in `test/helpers/` are not tests.
They do not load `.env` or require live Discord/API connections. Coverage includes
API errors, rate-limit timing, shared requests, stats formatting, proficiency,
pagination ownership, navigation expiry, season selection and labels, and season
catalog validation and cache expiry. All-season checks cover conflicting options,
mode filters, API confirmation, and separation from cached season-specific stats.
History checks cover request and response validation, cache expiry and mode
separation, text-table fallback, combined scoreboard layouts, native overview thumbnails,
PNG rendering, safe image downloads, missing ranks, attachment replacement,
summary fallback, navigation expiry, and lazy detail loading during navigation.
Rank checks cover season-specific history, all-time peak comparison, platform
separation, conflicting options, missing data, validation, and cache isolation.
Standalone match checks cover full-ID validation, participant UID matching,
missing players/matches, cache reuse, image attachments, and standalone labels
in both rendered and fallback replies.
Help checks cover command/option coverage, private replies without API access,
examples, Premium and cache explanations, unknown selections, and embed limits.

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
| `lib/discord/load-commands.js` | Loads commands, validates exports, and rejects duplicate names. |
| `lib/discord/handle-interaction.js` | Routes slash commands, applies cooldowns, and handles execution failures. |
| `lib/marvel-rivals-api/` | Player lookups, season catalog fetching, and shared HTTP request handling. |
| `lib/discord/set-presence.js` | Applies the configured status and activity. |
| `lib/embeds/stats/` | Builds career and proficiency pages; combines them with page numbering. |
| `lib/embeds/history/` | Builds history summaries, match overviews, and team leaderboard tables. |
| `lib/rendering/history/` | Loads bounded public images and renders team scoreboards as PNGs. |
| `lib/embeds/rank/` | Builds latest/season rank cards and the all-time peak card. |
| `lib/help/command-guides.js` | Stores command usage, examples, and limitations for the help menu. |
| `lib/embeds/help/` | Builds the help overview and detailed command guides. |
| `lib/services/` | Resolves public seasons and assembles lazy history messages with images or text fallbacks. |
| `lib/formatting/` | Shared numbers, accuracy, rank labels/badges, and Markdown text formatting. |
| `lib/discord/paginate-embeds.js` | Handles message-scoped page navigation. |
| `lib/cache.js` | Stores completed results with expiry and a size limit. |
| `lib/cooldowns.js` | Tracks per-user, per-command cooldowns. |
| `scripts/` | Standalone local utilities. |
| `test/` | Automated tests. |
| `test/helpers/` | Isolated dummy command loading and mock-fetch cleanup. |

To follow the code, start with `index.js`, then the interaction handler and a
command such as `commands/history.js`. Endpoint files handle API access, services
coordinate lookups, embed builders handle presentation, and the paginator handles
button interactions. No barrel files or central environment configuration module
are required.

The shared API validation module checks credentials, HTTPS URLs, player UIDs, and
mode inputs before cached results are returned. Endpoint-specific response
validation stays in each endpoint file. Cached requests store successful results
only after validation, and remove failed pending requests so later calls can retry.

### Request controls

- Commands have a **five-second cooldown per user and command**.
- Career, proficiency, rank history, match history, and match details are cached for **60 seconds**.
  Season lists are cached for **one hour**. All six use a shared **100-entry cache limit**.
  Career cache keys include season and mode filters; history keys include page,
  page size, and mode category. Different filters use separate entries.
  Rank history caches each selected season separately from unfiltered all-time data.
  Username search is not cached.
- `lib/marvel-rivals-api/cached-request.js` handles caching and shares identical
  pending requests for all six cached endpoints, including response validation.
  Failed lookups are removed so they can be retried. Username search remains uncached.
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
| Expanded ranks | Linked-account defaults and rank progression over time; latest, seasonal, and all-time peak lookups are available through `/rank`. |
| Expanded matches | Older history-page fetching and linked-account defaults; `/history` and standalone `/match player match-id` already show full scoreboards. |
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
| Status | `/status` for bot/API availability and cache freshness; `/help [command]` is already available. |

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
