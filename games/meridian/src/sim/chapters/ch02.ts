// Chapter 2 — Qasr Amal
// A harbour market held by the Gilt Company. Stealth through the docks, push a crate to reach
// the rooftops, dodge a sniper, fall through an awning into a market shootout, then solve the
// lever puzzle that opens Catalina's archive.

import { LevelBuilder } from "../world/LevelBuilder";
import type { ChapterScript } from "../story/types";

export function buildCh02() {
  const b = new LevelBuilder("ch02", { top: "#f2b880", bottom: "#f6e3c4", fog: "#f3d7b0", fogDensity: 0.008 });

  // --- 1. Docks (stealth) -----------------------------------------------------------------
  b.box([-12, -8, -16], [12, 26, -12], "rock");
  b.walls(10, -14, 60);
  b.box([-10, -1, -12], [10, 0, 56], "stone");
  b.checkpoint("c1", [0, 0, -6], 0, "Harbour Steps");
  b.pickup([2, 0.3, -4], "bottle", 2);
  b.treasure("ch02-lamp", [8, 0.4, -8], "Brass Oil Lamp", "Hammered brass with a spout shaped like a swallow. Harbour lamps like this lit Catalina's departures.");
  b.cover(-2, 8, 2.4, 1.0, 0, "low", "wood");
  b.cover(3, 18, 1.2, 2.4, 0, "high", "wood");
  b.cover(-5, 20, 2.4, 1.0, 0, "low", "wood");
  b.cover(6, 9, 1.2, 1.2, 0, "high", "wood");
  b.grass([-10, 0, 3], [-7, 1.4, 15]);
  b.grass([7, 0, 15], [10, 1.4, 27]);
  b.arena("docks", [-10, -1, -12], [10, 3, 44]);
  b.enemy("rifleman", [-6, 0, 12], 90, "docks", { patrol: [[-6, 0, 12], [6, 0, 12]] });
  b.enemy("rifleman", [6, 0, 30], -90, "docks");
  b.enemy("shotgunner", [-7, 0, 18], 0, "docks", { patrol: [[-7, 0, 18], [-1, 0, 27], [-7, 0, 26]] });

  // Buildings: roof A (reach with the crate), roof B (jump across), wall C behind.
  b.box([-10, 0, 30], [-2, 4.0, 44], "plaster", { ledges: ["s"] });
  b.crate(-5, 24, 0, 1.0);
  b.box([-10, 0, 44], [1.2, 7, 46], "plaster");
  b.box([1.2, 0, 36], [10, 5.5, 56], "plaster", { ledges: ["w"] });
  b.trigger([-10, 0, 22], [-1, 3, 29.5], "tut:crate");
  b.treasure("ch02-tile", [-8.5, 4.4, 34], "Azulejo Tile", "A blue and white glazed tile showing a ship sailing toward a single star.");
  b.trigger([1.2, 5.5, 40], [10, 8, 46], "roofB");

  // --- 2. Canal and beam ------------------------------------------------------------------
  b.beam([4, 5.5, 56], [4, 5.5, 60]);
  b.box([-10, -4, 56], [10, -3, 60], "stone");
  b.water([-10, -4, 56], [10, 1, 60]);
  b.box([-12, -1, 60], [12, 0, 118], "stone"); // market ground (also under roof C)
  b.walls(12, 60, 152);
  b.box([10, -8, 56], [12, 26, 60], "rock");
  b.box([-12, -8, 56], [-10, 26, 60], "rock");

  // --- 3. Roof C (sniper) -----------------------------------------------------------------
  b.box([-10, 0, 60], [6, 5.5, 76], "plaster", { ledges: ["s"] });
  b.handholds("z", 60, -1, -6, -6, [1.7, 3.6], 1.4);
  b.checkpoint("c3", [0, 5.5, 64], 0, "Rooftops");
  b.trigger([-10, 5.5, 63], [6, 8, 67], "chase_start");
  b.cover(-6, 67, 1, 1, 5.5, "high", "plaster");
  b.cover(2, 70, 1, 1, 5.5, "high", "plaster");
  b.cover(-2, 73.5, 2.4, 0.8, 5.5, "low", "plaster");
  b.treasure("ch02-quadrant", [4.5, 5.9, 74.5], "Pocket Quadrant", "A navigator's quadrant small enough to fit a palm. Its plumb line is a braid of red silk.");
  b.box([-4, 5.1, 76], [2, 5.3, 82], "wood", { group: "awning" });
  b.trigger([-4, 5.3, 76.5], [2, 7, 82], "awning_step");

  // --- 4. Market shootout -----------------------------------------------------------------
  b.checkpoint("c4", [-1, 0, 80], 0, "Spice Market");
  b.trigger([-12, 0, 78], [12, 3, 86], "market_enter");
  b.box([3, 0, 110], [9, 9.5, 116], "stone"); // sniper tower
  b.arena("roofs", [3, 9, 110], [9, 11, 116]);
  b.enemy("sniper", [6, 9.5, 113], 180, "roofs", { wave: "snipers", alerted: true });
  b.arena("market", [-12, -1, 76], [12, 3, 118]);
  b.cover(-6, 87, 3, 0.8, 0, "low", "wood", 60);
  b.cover(5, 89, 0.8, 3, 0, "high", "stone");
  b.cover(0, 95, 3, 0.8, 0, "low", "stone");
  b.cover(-8, 99, 0.8, 3, 0, "high", "stone");
  b.cover(8.5, 101, 3, 0.8, 0, "low", "wood", 60);
  b.cover(-3, 105, 3, 0.8, 0, "low", "stone");
  b.cover(0, 109, 0.8, 3, 0, "high", "stone");
  b.barrel(2, 91, 0);
  b.barrel(-5, 102, 0);
  b.barrel(-9, 112, 0);
  b.pickup([-10.5, 0.4, 82], "weapon", 12, "shotgun");
  b.pickup([10.5, 0.4, 84], "weapon", 40, "rifle");
  b.pickup([0, 0.3, 90], "ammo", 25);
  b.pickup([-10, 0.3, 96], "grenade", 1);
  b.pickup([9, 0.3, 106], "ammo", 25);
  b.pickup([-4, 0.3, 112], "grenade", 1);
  b.treasure("ch02-dagger", [10.5, 0.5, 116.5], "Gilded Letter Opener", "Varek's crest on the hilt. He likes to sign his correspondence in person.");
  b.enemy("rifleman", [-6, 0, 108], 180, "market", { wave: "market1", alerted: true });
  b.enemy("rifleman", [6, 0, 104], 180, "market", { wave: "market1", alerted: true });
  b.enemy("shotgunner", [0, 0, 113], 180, "market", { wave: "market1", alerted: true });
  b.enemy("grenadier", [-8, 0, 115], 180, "market", { wave: "market2", alerted: true });
  b.enemy("rifleman", [8, 0, 115], 180, "market", { wave: "market2", alerted: true });
  b.enemy("rifleman", [-1, 0, 116], 180, "market", { wave: "market2", alerted: true });
  b.enemy("heavy", [0, 0, 116.5], 180, "market", { wave: "market3", alerted: true });
  b.enemy("rifleman", [-6, 0, 116.5], 180, "market", { wave: "market3", alerted: true });
  b.box([-12, 0, 118], [-3, 8, 119], "plaster");
  b.box([3, 0, 118], [12, 8, 119], "plaster");
  b.box([-3, 0, 118], [3, 4, 119], "metal", { group: "marketgate" });

  // --- 5. Courtyard puzzle and archive ----------------------------------------------------
  b.box([-12, -1, 118], [12, 0, 162], "stone");
  b.checkpoint("c5", [0, 0, 123], 0, "Courtyard of Swallows");
  b.interact("mural", [-10.6, 1.6, 128], "examine", "Examine the mural", "mural", { once: false });
  b.block(-11, 128, 1, 4, 0, 3.5, "plaster");
  b.interact("lever_star", [-6, 1, 136], "lever", "Pull the Star lever", "lever", { once: false });
  b.interact("lever_sun", [0, 1, 141], "lever", "Pull the Sun lever", "lever", { once: false });
  b.interact("lever_moon", [6, 1, 136], "lever", "Pull the Moon lever", "lever", { once: false });
  b.block(-6, 136.8, 0.6, 0.6, 0, 1.0, "metal");
  b.block(0, 141.8, 0.6, 0.6, 0, 1.0, "metal");
  b.block(6, 136.8, 0.6, 0.6, 0, 1.0, "metal");
  b.box([-12, 0, 148], [-2, 10, 150], "plaster");
  b.box([2, 0, 148], [12, 10, 150], "plaster");
  b.box([-2, 0, 148], [2, 4, 150], "stone", { group: "archivedoor" });
  b.box([-12, 4, 148], [12, 10, 150], "plaster");
  b.walls(8, 150, 164);
  b.box([-10, -8, 162], [10, 26, 166], "rock");
  b.trigger([-8, 0, 153], [8, 3, 157], "archive");
  b.treasure("ch02-ledger", [0, 0.5, 160], "Harbourmaster's Ledger", "An entry for 3 March 1574: 'Santa Brigida, Capt. C. de Ordaz, cargo: none declared.'");

  return b.build();
}

export const ch02Script: ChapterScript = {
  parTimeMinutes: 25,
  startLoadout: { sidearm: "pistol", long: null, sidearmAmmo: 45, grenades: 0, bottles: 0 },
  onStart: [
    { type: "music", mood: "tension" },
    { type: "stealth", active: true },
    { type: "objective", text: "Find a way up to the rooftops", target: { x: -5, y: 4, z: 30 } },
    {
      type: "dialogue",
      lines: [
        { speaker: "Bram", text: "Qasr Amal. Varek's people own the docks now. Gold paint on every crate." },
        { speaker: "Ines", text: "Catalina kept an archive here. If the meridian points anywhere, it's there." },
        { speaker: "Bram", text: "Then stay out of sight. Throw something if you need them looking the other way." },
      ],
    },
    { type: "tutorial", text: "Hold Throw to aim a bottle and release to throw it. Guards will go and check the noise." },
  ],
  events: {
    "tut:crate": [
      { type: "tutorial", text: "Hold Interact next to a crate, then push or pull it. Climb on it to reach high ledges.", action: "interact" },
    ],
    roofB: [
      { type: "stealth", active: false },
      { type: "objective", text: "Cross the rooftops toward the old town", target: { x: 4, y: 5.5, z: 60 } },
      { type: "dialogue", lines: [{ speaker: "Ines", text: "Nice view. Shame about all the guns." }] },
    ],
    chase_start: [
      { type: "spawn", wave: "snipers" },
      { type: "music", mood: "combat" },
      { type: "dialogue", lines: [{ speaker: "Bram", text: "Sniper on the tower! Watch for the laser and stay behind cover!" }] },
      { type: "objective", text: "Get past the sniper", target: { x: -1, y: 5.3, z: 79 } },
    ],
    awning_step: [
      { type: "remove", group: "awning", delay: 0.6 },
      { type: "dialogue", lines: [{ speaker: "Ines", text: "This awning is not going to—" }] },
    ],
    market_enter: [
      { type: "checkpoint", id: "c4" },
      { type: "music", mood: "combat" },
      { type: "objective", text: "Survive the market ambush", target: { x: 0, y: 0, z: 117 } },
      { type: "emit", event: "market_wave1", delay: 2.5 },
      { type: "dialogue", lines: [{ speaker: "Mercenary", text: "She's in the market! Box her in!" }] },
    ],
    market_wave1: [{ type: "spawn", wave: "market1" }],
    "waveClear:market1": [
      { type: "spawn", wave: "market2" },
      { type: "dialogue", lines: [{ speaker: "Gilt Radio", text: "Grenadier, flush her out of that cover." }] },
    ],
    "waveClear:market2": [
      { type: "spawn", wave: "market3" },
      { type: "dialogue", lines: [{ speaker: "Bram", text: "Heavy coming through the gate! Armour on the front, go for the head or flank him!" }] },
    ],
    "waveClear:market3": [
      { type: "remove", group: "marketgate" },
      { type: "music", mood: "explore" },
      { type: "objective", text: "Find Catalina's archive", target: { x: 0, y: 0, z: 140 } },
      { type: "dialogue", lines: [{ speaker: "Ines", text: "Gate's open. The archive should be through the courtyard." }] },
    ],
    mural: [
      { type: "journal", id: "mural" },
      { type: "dialogue", lines: [{ speaker: "Ines", text: "'The sun sets, the moon rises, the star guides the sailor home.' It's an order." }] },
      { type: "objective", text: "Pull the levers in the order the mural describes", target: { x: 0, y: 1, z: 140 } },
    ],
    lever: [],
    levers_solved: [
      { type: "remove", group: "archivedoor" },
      { type: "objective", text: "Enter the archive", target: { x: 0, y: 0, z: 155 } },
    ],
    archive: [
      { type: "journal", id: "archive" },
      {
        type: "cutscene",
        shots: [{ from: { x: 0, y: 2.5, z: 152 }, to: { x: 0, y: 2.2, z: 156 }, target: { x: 0, y: 1, z: 161 }, duration: 6 }],
        lines: [
          { speaker: "Ines", text: "Charts, letters... and this. A map of the Serra Verde with a temple circled twice." },
          { speaker: "Bram", text: "Jungle. Of course it's jungle." },
          { speaker: "Varek", text: "Keep running, Miss Calder. You are drawing me a lovely map." },
        ],
      },
      { type: "emit", event: "end", delay: 7 },
    ],
    end: [{ type: "complete" }],
  },
  puzzles: [
    {
      id: "levers",
      type: "sequence",
      levers: ["lever_star", "lever_sun", "lever_moon"],
      order: ["lever_sun", "lever_moon", "lever_star"],
      onSolve: "levers_solved",
      hint: "The mural: the sun sets, then the moon rises, then the star guides the sailor home. Sun, Moon, Star.",
    },
  ],
  journal: [
    {
      id: "mural",
      title: "Mural of the Swallows",
      text: "Painted tiles show a ship leaving harbour. Beneath it, in Catalina's hand: 'The sun sets, the moon rises, the star guides the sailor home.'",
      sketch: [[20, 30, 30, 20], [70, 25, 80, 35], [45, 70, 55, 60], [10, 85, 90, 85]],
    },
    {
      id: "archive",
      title: "Catalina's Archive",
      text: "A sealed room of charts. One map of the Serra Verde jungle marks a temple with the same serpent-and-star seal found at the wreck. Catalina called it 'the Green Vault'.",
      sketch: [[10, 90, 50, 10], [50, 10, 90, 90], [30, 60, 70, 60], [50, 40, 50, 70]],
    },
  ],
};
