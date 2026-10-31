// Entry point: start the game and register the offline service worker in production builds.

import { Game } from "./core/Game";

const game = new Game();
game.boot().catch((err) => {
  console.error(err);
  const boot = document.getElementById("boot");
  if (boot) boot.textContent = "Meridian could not start. Your browser may not support WebGL.";
});

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => undefined);
  });
}
