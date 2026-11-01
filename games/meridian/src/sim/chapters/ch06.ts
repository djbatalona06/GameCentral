// Chapter 6 — Night Train to Varanask
// Fight forward along a speeding train at night. The train itself stays still in the simulation;
// the scenery streams past (see LevelData.scroll), which keeps collision rock-solid. Tunnels sweep
// over the roofs, so the player must crouch or be knocked off. Falling between or beside the
// cars is fatal. Kessa Varn waits on the last flatcar before the locomotive.

import { LevelBuilder } from "../world/LevelBuilder";
import type { ChapterScript } from "../story/types";

// Car layout along +Z. Decks (flatcars) are at y 1.4, roofs (boxcars) at y 4.
const W = 2.5; // half width
const DECK = 1.4;
const ROOF = 4;

export function buildCh06() {
  const b = new LevelBuilder("ch06", { top: "#0d1424", bottom: "#29324a", fog: "#1b2233", fogDensity: 0.016 }, -10);
  b.scroll(24);

  const flat = (z0: number, z1: number) => b.box([-W, 0.8, z0], [W, DECK, z1], "wood");
  const boxcar = (z0: number, z1: number) => b.box([-W, 0.8, z0], [W, ROOF, z1], "metal", { ledges: ["s"] });
  const coupler = (z0: number, z1: number) => b.box([-0.6, 0.8, z0], [0.6, DECK, z1], "metal");

  // Falling off the train (beside it or between cars) is fatal.
  b.hazard("rails", "kill", [-40, -8, -20], [40, 0.9, 185]);

  // --- Caboose ----------------------------------------------------------------------------
  flat(0, 10);
  b.box([-W, DECK, 0], [W, 3.6, 3], "wood"); // caboose cabin
  b.checkpoint("c1", [0, DECK, 6], 0, "Caboose");
  b.pickup([1.6, DECK + 0.3, 5], "ammo", 30);
  b.treasure("ch06-ticket", [-1.8, DECK + 0.4, 4], "First-Class Ticket, 1931", "Punched for Varanask and never used. The passenger's name has been carefully scratched out.");
  coupler(10, 11.5);

  // --- Boxcars 1 and 2 (first tunnel) -----------------------------------------------------
  boxcar(11.5, 27.5);
  coupler(27.5, 29);
  boxcar(29, 45);
  b.trigger([-W, ROOF, 14], [W, ROOF + 3, 17], "tunnel1");
  b.hazard("tunnel1", "tunnel", [-8, ROOF + 1.3, 175], [8, 16, 178], { vel: [0, 0, -22], travel: 210, startActive: false, warn: "Tunnel! Get down!" });
  b.treasure("ch06-watch", [1.8, ROOF + 0.4, 41], "Conductor's Pocket Watch", "Stopped at 3:14. The case is engraved with the railway's crest: a wolf running along a line.");
  coupler(45, 46.5);

  // --- Flatcar 3: first fight -------------------------------------------------------------
  flat(46.5, 62.5);
  b.checkpoint("c2", [0, DECK, 48.5], 0, "Lumber Flatcar");
  b.cover(-1.2, 52, 2, 0.8, DECK, "low", "wood", 60);
  b.cover(1.4, 56, 1.6, 0.8, DECK, "high", "wood");
  b.cover(-1.4, 60, 1.6, 0.8, DECK, "low", "wood");
  b.pickup([2, DECK + 0.3, 50], "grenade", 1);
  b.arena("a1", [-W, 0.8, 46.5], [W, 3.5, 62.5]);
  b.enemy("rifleman", [0, DECK, 58], 180, "a1");
  b.enemy("shotgunner", [1.5, DECK, 61.5], 180, "a1");
  b.arena("a1r", [-W, ROOF - 0.2, 64], [W, ROOF + 2, 80]);
  b.enemy("sniper", [0, ROOF, 76], 180, "a1r");
  b.trigger([-W, DECK, 47], [W, DECK + 3, 49], "a1");
  coupler(62.5, 64);

  // --- Boxcar 4 (second tunnel) -----------------------------------------------------------
  boxcar(64, 80);
  b.trigger([-W, ROOF, 66], [W, ROOF + 3, 69], "tunnel2");
  b.hazard("tunnel2", "tunnel", [-8, ROOF + 1.3, 175], [8, 16, 178], { vel: [0, 0, -22], travel: 210, startActive: false, warn: "Another tunnel! Down!" });
  coupler(80, 81.5);

  // --- Flatcar 5: second fight ------------------------------------------------------------
  flat(81.5, 97.5);
  b.checkpoint("c3", [0, DECK, 83.5], 0, "Ore Flatcar");
  b.cover(1.2, 87, 2, 0.8, DECK, "low", "metal");
  b.cover(-1.4, 91, 1.6, 0.8, DECK, "high", "metal");
  b.cover(1.4, 95, 1.6, 0.8, DECK, "low", "metal");
  b.barrel(-1.8, 87, DECK);
  b.pickup([-2, DECK + 0.3, 84], "ammo", 30);
  b.treasure("ch06-lantern", [2, DECK + 0.4, 97], "Signal Lantern", "Red and green glass in a tin case. Shake it and something rattles inside: a rolled-up note.");
  b.arena("a2", [-W, 0.8, 81.5], [W, 3.5, 97.5]);
  b.enemy("brute", [0, DECK, 94], 180, "a2");
  b.enemy("grenadier", [-1.5, DECK, 96.5], 180, "a2");
  b.enemy("rifleman", [1.5, DECK, 96.5], 180, "a2");
  b.trigger([-W, DECK, 82], [W, DECK + 3, 84], "a2");
  coupler(97.5, 99);

  // --- Boxcar 6 (third tunnel) ------------------------------------------------------------
  boxcar(99, 115);
  b.trigger([-W, ROOF, 101], [W, ROOF + 3, 104], "tunnel3");
  b.hazard("tunnel3", "tunnel", [-8, ROOF + 1.3, 175], [8, 16, 178], { vel: [0, 0, -26], travel: 210, startActive: false, warn: "Long tunnel! Stay down!" });
  b.treasure("ch06-badge", [-1.8, ROOF + 0.4, 112], "Gilt Company Badge", "Gold plate over tin. Even the Gilt Company's gold isn't real.");
  coupler(115, 116.5);

  // --- Flatcar 7: Kessa -------------------------------------------------------------------
  flat(116.5, 140);
  b.checkpoint("c4", [0, DECK, 118.5], 0, "Last Flatcar");
  b.trigger([-W, DECK, 120], [W, DECK + 3, 122], "boss");
  b.cover(-1.3, 125, 1.8, 0.8, DECK, "low", "wood", 60);
  b.cover(1.4, 129, 1.6, 0.8, DECK, "high", "metal");
  b.cover(-1.4, 133, 1.6, 0.8, DECK, "low", "metal");
  b.cover(1.3, 137, 1.8, 0.8, DECK, "low", "wood", 60);
  b.pickup([-2, DECK + 0.3, 119], "weapon", 6, "shotgun");
  b.pickup([2, DECK + 0.3, 119], "ammo", 30);
  b.pickup([0, DECK + 0.3, 131], "grenade", 2);
  b.arena("boss", [-W, 0.8, 116.5], [W, 3.5, 140]);
  b.enemy("kessa", [0, DECK, 138], 180, "boss", { wave: "boss", alerted: true });
  b.enemy("rifleman", [-1.6, DECK, 139.4], 180, "boss", { wave: "bossadds", alerted: true });
  b.enemy("shotgunner", [1.6, DECK, 139.4], 180, "boss", { wave: "bossadds", alerted: true });
  coupler(140, 141.5);

  // --- Locomotive (stop the train) --------------------------------------------------------
  b.box([-W, 0.8, 141.5], [W, DECK, 147], "metal"); // cab floor
  b.box([-W, 0.8, 147], [W, 4.5, 162], "metal"); // boiler
  b.box([-W, DECK, 141.5], [-2.2, 3.6, 147], "metal"); // cab walls
  b.box([2.2, DECK, 141.5], [W, 3.6, 147], "metal");
  b.checkpoint("c5", [0, DECK, 143], 0, "Locomotive Cab");
  b.interact("plate", [-1.6, 2.4, 142.2], "examine", "Read the engineer's plate", "plate", { once: false, radius: 1.2 });
  b.interact("v_steam", [1.6, 2.4, 146], "valve", "Close the steam valve", "valve", { once: false, radius: 1.1 });
  b.interact("v_brake", [0, 2.4, 146.6], "valve", "Set the brake", "valve", { once: false, radius: 1.1 });
  b.interact("v_coupler", [-1.6, 2.4, 146], "lever", "Release the coupler", "valve", { once: false, radius: 1.1 });
  b.treasure("ch06-map", [1.7, DECK + 0.4, 142.2], "Varanask Rail Map", "Hand-drawn, with a spur line nobody else's map shows. It ends at a shipyard.");

  return b.build();
}

export const ch06Script: ChapterScript = {
  parTimeMinutes: 28,
  startLoadout: { sidearm: "revolver", long: "rifle", sidearmAmmo: 24, longAmmo: 60, grenades: 1, bottles: 0 },
  onStart: [
    { type: "music", mood: "tension" },
    { type: "objective", text: "Work your way forward to the locomotive", target: { x: 0, y: 4, z: 140 } },
    {
      type: "dialogue",
      lines: [
        { speaker: "Bram", text: "I'm in the car behind you. Kessa's up front with the chart case." },
        { speaker: "Ines", text: "Then I'm going over the roofs." },
        { speaker: "Bram", text: "Mountain line, Ines. Lots of tunnels. Keep your head down. I mean that literally." },
      ],
    },
    { type: "tutorial", text: "Climb the ladder edge onto the boxcar. Jump the gaps between cars; falling off the train is fatal.", action: "jump" },
  ],
  events: {
    tunnel1: [
      { type: "hazard", id: "tunnel1", active: true },
      { type: "tutorial", text: "Crouch now! Stay crouched until the tunnel has passed over you.", action: "crouch" },
    ],
    tunnel2: [{ type: "hazard", id: "tunnel2", active: true }],
    tunnel3: [{ type: "hazard", id: "tunnel3", active: true }],
    a1: [
      { type: "music", mood: "combat" },
      { type: "dialogue", lines: [{ speaker: "Mercenary", text: "She's on the lumber car! Sniper, light her up!" }] },
    ],
    "arenaClear:a1": [{ type: "music", mood: "tension" }],
    a2: [
      { type: "music", mood: "combat" },
      { type: "dialogue", lines: [{ speaker: "Ines", text: "A brute on a moving train. Of course." }] },
    ],
    "arenaClear:a2": [{ type: "music", mood: "tension" }],
    "arenaClear:a1r": [],
    boss: [
      { type: "music", mood: "combat" },
      { type: "spawn", wave: "boss" },
      {
        type: "cutscene",
        shots: [{ from: { x: 2, y: 3.4, z: 121 }, to: { x: -1, y: 3, z: 124 }, target: { x: 0, y: 2.6, z: 138 }, duration: 4 }],
        lines: [
          { speaker: "Kessa", text: "You let me live. Don't think that buys you anything.", if: { flag: "kessa.spared" } },
          { speaker: "Kessa", text: "You took my radio. I want it back.", if: { flag: "kessa.bound" } },
          { speaker: "Kessa", text: "You rang a bell and buried a monastery. Varek was almost impressed.", if: { not: { flag: "bells.muffled" } } },
          { speaker: "Kessa", text: "You tiptoed through a monastery and it fell on you anyway. Varek was almost impressed.", if: { flag: "bells.muffled" } },
          { speaker: "Ines", text: "Hand over the chart case, Kessa. There's nowhere to go." },
          { speaker: "Kessa", text: "It's a train. There's only forward." },
        ],
      },
      { type: "objective", text: "Defeat Kessa Varn", target: { x: 0, y: DECK, z: 135 } },
    ],
    "bossPhase:2": [
      { type: "spawn", wave: "bossadds" },
      { type: "dialogue", lines: [{ speaker: "Kessa", text: "Get up here, both of you! Earn your gold!" }] },
    ],
    "bossPhase:3": [{ type: "dialogue", lines: [{ speaker: "Bram", text: "Shotgun again! Back off and let her come to you!" }] }],
    "arenaClear:boss": [
      { type: "music", mood: "tension" },
      {
        type: "dialogue",
        lines: [
          { speaker: "Kessa", text: "Go on, then. Take the case. He already has what he needs." },
          { speaker: "Bram", text: "Ines, the driver jumped. Nobody's stopping this train!" },
        ],
      },
      { type: "objective", text: "Stop the train from the locomotive cab", target: { x: 0, y: 2, z: 144 } },
    ],
    plate: [
      { type: "journal", id: "plate" },
      { type: "objective", text: "Work the controls in the order on the plate", target: { x: 0, y: 2, z: 146 } },
    ],
    valve: [],
    stopped: [
      { type: "shake", amount: 1 },
      { type: "music", mood: "wonder" },
      {
        type: "cutscene",
        shots: [{ from: { x: 4, y: 5, z: 140 }, to: { x: 6, y: 6, z: 150 }, target: { x: 0, y: 2, z: 144 }, duration: 6 }],
        lines: [
          { speaker: "Ines", text: "Brakes are holding. We're stopping." },
          { speaker: "Ines", text: "Kessa said Varek already has what he needs. The chart was a decoy." },
          { speaker: "Bram", text: "Then what's in the case?" },
          { speaker: "Ines", text: "Shipping orders. Ironwood Docks. Tomorrow night." },
        ],
      },
      { type: "emit", event: "end", delay: 6.5 },
    ],
    end: [{ type: "complete" }],
  },
  puzzles: [
    {
      id: "controls",
      type: "sequence",
      levers: ["v_steam", "v_brake", "v_coupler"],
      order: ["v_steam", "v_brake", "v_coupler"],
      onSolve: "stopped",
      hint: "The plate says: close the steam first, then set the brake, then release the coupler.",
    },
  ],
  journal: [
    {
      id: "plate",
      title: "Engineer's Plate",
      text: "Stamped brass: 'TO STOP UNDER LOAD. One: close STEAM. Two: set BRAKE. Three: release COUPLER. Never in any other order.'",
      sketch: [[15, 25, 85, 25], [15, 50, 85, 50], [15, 75, 85, 75], [10, 15, 90, 15], [90, 15, 90, 85], [90, 85, 10, 85], [10, 85, 10, 15]],
    },
  ],
};
