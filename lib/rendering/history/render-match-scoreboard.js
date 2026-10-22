// Renders one combined match scoreboard PNG off the event loop using bundled fonts.
const path = require("node:path");
const { renderAsync } = require("@resvg/resvg-js");
const { buildMatchScoreboardSvg } = require("./build-match-scoreboard-svg");

const fontDirectory = path.resolve(__dirname, "../../../assets/fonts");

async function renderMatchScoreboard(teams, selectedUid, images) {
  const svg = buildMatchScoreboardSvg(teams, selectedUid, images);
  const rendered = await renderAsync(svg, {
    font: {
      fontFiles: [path.join(fontDirectory, "NotoSans-Regular.ttf"), path.join(fontDirectory, "NotoSans-Bold.ttf")],
      loadSystemFonts: false,
      defaultFontFamily: "Noto Sans",
    },
  });
  return rendered.asPng();
}

module.exports = { renderMatchScoreboard };
