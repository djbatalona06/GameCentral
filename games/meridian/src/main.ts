// Entry point: start the game and register the offline service worker in production builds.
// The store apps (Capacitor) already ship every file inside the app, so they skip it.

import { Game } from "./core/Game";
import { isNative } from "./platform/native";

const game = new Game();
game.boot().catch((err) => {
  console.error(err);
  const boot = document.getElementById("boot");
  if (boot) boot.textContent = "Meridian could not start. Your browser may not support WebGL.";
});

if ("serviceWorker" in navigator && import.meta.env.PROD && !isNative()) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => undefined);
  });
}
