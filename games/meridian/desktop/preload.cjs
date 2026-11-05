// The only things the game page may ask the desktop app for: full screen and quitting.
// Nothing else from the computer is exposed to the page.
const { contextBridge, ipcRenderer } = require("electron");

let fullscreen = ipcRenderer.sendSync("fs:get");
ipcRenderer.on("fs:changed", (_event, on) => {
  fullscreen = on;
});

contextBridge.exposeInMainWorld("meridianDesktop", {
  platform: process.platform,
  isFullscreen: () => fullscreen,
  setFullscreen: (on) => ipcRenderer.send("fs:set", !!on),
  quit: () => ipcRenderer.send("app:quit"),
});
