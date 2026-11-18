/**
 * Draws `docs/images/logo.svg` into `resources/icon.png`, the application's icon.
 *
 * Run with `npm run icon`, which is `electron resources/render-icon.cjs`: Electron,
 * already a development dependency, is the one rasteriser this project has, so no
 * dependency is added for it. The SVG is loaded into a hidden transparent window
 * at 512 by 512 CSS pixels and the window's surface is captured, so the rounded
 * corners of the logo stay transparent. The output is committed; this script is
 * what regenerates it, and nothing in the build or the gates runs it.
 */
const { app, BrowserWindow } = require('electron');
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const SIZE = 512;
const root = join(__dirname, '..');

app.disableHardwareAcceleration();

void app.whenReady().then(async () => {
  const svg = readFileSync(join(root, 'docs', 'images', 'logo.svg'), 'utf8');
  const page =
    '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}' +
    `img{display:block;width:${SIZE}px;height:${SIZE}px}</style>` +
    `<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`;
  const window = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    frame: false,
    transparent: true,
    useContentSize: true,
    webPreferences: { offscreen: true },
  });
  await window.loadURL(`data:text/html;base64,${Buffer.from(page).toString('base64')}`);
  // An offscreen window paints on its own schedule; wait for a frame that holds the image.
  await new Promise((resolve) => setTimeout(resolve, 500));
  const image = await window.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE });
  writeFileSync(join(__dirname, 'icon.png'), image.toPNG());
  app.quit();
});
