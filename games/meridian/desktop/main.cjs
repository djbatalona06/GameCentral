// Meridian desktop app (Windows, Mac, Linux). It opens a window that runs exactly the same game
// as the website, from the files packed inside the app, so it works with no internet at all.
//
// Build it:  npm run desktop:build   (output in desktop-release/)
// Try it:    npm run desktop:dev     (builds the game, then opens the window)

const { app, BrowserWindow, ipcMain, net, protocol, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const DIST = path.join(__dirname, "..", "dist");
const STATE_FILE = () => path.join(app.getPath("userData"), "window.json");

// The game is served from app://meridian/ rather than file://, so saving (IndexedDB), fetch and
// the in-game backdrops all behave the same as on the website.
// If a computer's graphics driver is missing or blocked, still run (slowly) on the software
// renderer instead of showing "could not start". A working graphics card is always preferred.
app.commandLine.appendSwitch("enable-unsafe-swiftshader");

protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE(), "utf8"));
  } catch {
    return { width: 1600, height: 900, fullscreen: true };
  }
}

function writeState(win) {
  try {
    const b = win.getNormalBounds();
    fs.writeFileSync(STATE_FILE(), JSON.stringify({ ...b, fullscreen: win.isFullScreen(), maximized: win.isMaximized() }));
  } catch {
    // Not being able to remember the window size is not worth bothering the player about.
  }
}

function createWindow() {
  const s = readState();
  const win = new BrowserWindow({
    x: s.x,
    y: s.y,
    width: s.width ?? 1600,
    height: s.height ?? 900,
    minWidth: 960,
    minHeight: 540,
    fullscreen: s.fullscreen !== false,
    backgroundColor: "#0f1418",
    autoHideMenuBar: true,
    title: "Meridian",
    icon: path.join(DIST, "icon-512.png"),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: true,
    },
  });
  win.removeMenu();
  if (s.maximized) win.maximize();
  win.once("ready-to-show", () => win.show());
  win.on("close", () => writeState(win));
  const tell = () => win.webContents.send("fs:changed", win.isFullScreen());
  win.on("enter-full-screen", tell);
  win.on("leave-full-screen", tell);

  // Stay on the game: links to other sites open in the normal web browser instead.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("app://meridian/")) e.preventDefault();
  });
  win.loadURL("app://meridian/index.html");
  return win;
}

app.whenReady().then(() => {
  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const file = path.normalize(path.join(DIST, rel));
    if (!file.startsWith(DIST)) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });

  ipcMain.on("fs:get", (e) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    e.returnValue = !!w && w.isFullScreen();
  });
  ipcMain.on("fs:set", (e, on) => BrowserWindow.fromWebContents(e.sender)?.setFullScreen(!!on));
  ipcMain.on("app:quit", () => app.quit());

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => app.quit());
