// Renders the website mockup to full-page PNGs with Electron (offscreen): desktop and phone widths.
// From packages/studio: node_modules/electron/dist/electron.exe ../../planning/website-mockup/render.cjs <index.html> <outDir> [desktop|phone]
const { app, BrowserWindow } = require("electron");
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const [page, out, which] = process.argv.slice(-3);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function shoot(width, name) {
  const win = new BrowserWindow({ width, height: 900, show: false, useContentSize: true, webPreferences: { offscreen: true } });
  await win.loadURL(pathToFileURL(page).href + "?shot");
  await win.webContents.executeJavaScript("document.fonts.ready.then(() => true)");
  await wait(2900); // the hero's first line is fully typed at about 2.3 s
  const height = await win.webContents.executeJavaScript("Math.ceil(document.documentElement.scrollHeight)");
  win.setContentSize(width, height);
  await wait(1200);
  const img = await win.webContents.capturePage({ x: 0, y: 0, width, height });
  writeFileSync(join(out, name), img.toPNG());
  console.log(`${name}: ${img.getSize().width}x${img.getSize().height}`);
  win.destroy();
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  try {
    if (which === "phone") await shoot(390, "mockup-phone.png");
    else await shoot(1440, "mockup-desktop.png");
  } catch (e) {
    console.error(e);
  }
  app.quit();
});
