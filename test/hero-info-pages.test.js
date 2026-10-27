// Tests hero information, biography pagination, icon fallbacks, and Discord embed limits without requests.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { escapeMarkdown } = require("discord.js");
const { buildHeroInfoPages } = require("../lib/embeds/heroes/build-hero-info-pages");
const fixture = require("./fixtures/hero-details.json");

const pagesFor = (hero = fixture, catalogHero = null) => buildHeroInfoPages(hero, catalogHero).map((page) => page.toJSON());
const value = (page, name) => page.fields.find((field) => field.name === name).value;

test("hero info presents identity, team-ups, catalog count, icon, and the available biography", () => {
  const before = structuredClone(fixture);
  const [overview, biography] = pagesFor();
  assert.equal(overview.title, "SPIDER-MAN — Hero Info");
  assert.equal(overview.description, fixture.description);
  assert.equal(value(overview, "Role"), "Duelist");
  assert.equal(value(overview, "Real name"), "Peter Parker");
  assert.equal(value(overview, "Catalog skins"), "2");
  assert.equal(value(overview, "Team-ups"), "• Sample Team-Up\n• Another Team-Up");
  assert.equal(overview.thumbnail.url, fixture.icon);
  assert.equal(biography.description, escapeMarkdown(fixture.biography));
  assert.equal(biography.thumbnail.url, fixture.icon);
  assert.match(biography.footer.text, /Page 2 \/ 2.*Cache: up to 1 hour/);
  assert.ok(!overview.fields.some((field) => /abilit/i.test(field.name)));
  assert.deepEqual(fixture, before);
});

test("missing information differs from an explicitly empty catalog list", () => {
  const sparse = { id: fixture.id, name: fixture.name, role: fixture.role };
  const missing = pagesFor(sparse);
  assert.equal(missing.length, 1);
  assert.equal(missing[0].description, "Unavailable");
  assert.equal(value(missing[0], "Real name"), "Unavailable");
  assert.equal(value(missing[0], "Catalog skins"), "Unavailable");
  assert.equal(value(missing[0], "Team-ups"), "Unavailable");
  assert.equal(value(missing[0], "Biography"), "No biography is available.");
  const [empty] = pagesFor({ ...sparse, skin_ids: [], teamups: [], biography: " " });
  assert.equal(value(empty, "Catalog skins"), "0");
  assert.equal(value(empty, "Team-ups"), "No team-ups listed.");
});

test("thumbnails fall back to regular and catalog icons while rejecting untrusted URLs", () => {
  const trusted = fixture.icon;
  for (const bad of [null, "not-a-url", "http://assets.rivalsisland.com/icon.png",
    "https://evil.example/icon.png", "https://key@assets.rivalsisland.com/icon.png"]) {
    const hero = { ...fixture, icon: bad, icons: { regular: bad } };
    assert.ok(pagesFor(hero).every((page) => !page.thumbnail));
    assert.ok(pagesFor({ ...hero, icons: { regular: trusted } }).every((page) => page.thumbnail.url === trusted));
    assert.ok(pagesFor(hero, { icon: trusted }).every((page) => page.thumbnail.url === trusted));
  }
});

test("long biographies split at word boundaries without dropping their text", () => {
  const biography = "A sample story about a hero and their adventures. ".repeat(130).trim();
  const pages = pagesFor({ ...fixture, biography });
  assert.ok(pages.length > 2);
  const story = pages.slice(1).map((page) => page.description);
  assert.equal(story.join(" "), biography);
  assert.ok(story.every((text) => text.length <= 3500));
  assert.ok(story.slice(0, -1).every((text) => !text.endsWith(" ")));
});

test("oversized external text is escaped and disclosed within bounded pages and fields", () => {
  const hero = {
    ...fixture,
    name: "**Hero**\n".repeat(100),
    description: "__Description__ ".repeat(500),
    real_name: "**Name** ".repeat(500),
    biography: "A very long biography paragraph. ".repeat(2000),
    teamups: Array.from({ length: 50 }, (_, index) => ({ id: index + 1, name: "**Team-up** ".repeat(100) })),
  };
  const pages = pagesFor(hero);
  assert.equal(pages.length, 6);
  assert.match(pages.at(-1).description, /Biography shortened to fit this view/);
  assert.match(value(pages[0], "Team-ups"), /and 42 more/);
  assert.ok(pages[0].title.includes("\\*\\*Hero\\*\\*"));
  for (const page of pages) {
    assert.ok(page.title.length <= 256 && !page.title.includes("\n"));
    assert.ok(page.description.length <= 4096);
    assert.ok((page.fields ?? []).length <= 25);
    let length = page.title.length + page.description.length + page.footer.text.length;
    for (const field of page.fields ?? []) {
      assert.ok(field.name.length > 0 && field.name.length <= 256);
      assert.ok(field.value.length > 0 && field.value.length <= 1024);
      length += field.name.length + field.value.length;
    }
    assert.ok(length <= 6000);
  }
});
