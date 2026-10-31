// Chapter 5 — Bell of Saint Aurel
// A snowy approach where falling snow shortens how far guards can see, a tall cliff climb to a
// mountain monastery, a courtyard firefight, a bell-ringing puzzle at the top of the tower (every
// note is captioned on screen), and a sprint downhill ahead of an avalanche.

import { LevelBuilder } from "../world/LevelBuilder";
import type { ChapterScript } from "../story/types";

export function buildCh05() {
  const b = new LevelBuilder("ch05", { top: "#9fb2c4", bottom: "#e9eef2", fog: "#cfd8e0", fogDensity: 0.014 }, -40);

  b.weather("snow", "snow", [-32, -2, -16], [32, 70, 290], { wind: [0.25, 0, 0] });

  // --- 1. Snowfield approach (stealth) ----------------------------------------------------
  b.box([-30, -1, -14], [30, 0, 72], "snow");
  b.box([-16, -8, -18], [16, 30, -14], "rock");
  b.walls(14, -14, 72);
  b.checkpoint("c1", [0, 0, -8], 0, "Saint Aurel Trail");
  b.trigger([-14, 0, -4], [14, 3, -1], "tut:snow");
  b.grass([-12, 0, 6], [-5, 1.4, 20]); // snow-laden juniper
  b.grass([5, 0, 22], [12, 1.4, 36]);
  b.grass([-9, 0, 42], [-1, 1.4, 52]);
  for (const [x, z] of [[-3, 4], [8, 12], [-10, 28], [3, 40], [10, 50], [-6, 60]]) b.block(x, z, 1.2, 1.2, 0, 3.2, "foliage"); // pines
  b.cover(0, 18, 2.4, 0.9, 0, "low", "rock");
  b.cover(-4, 34, 0.9, 2.6, 0, "high", "rock");
  b.cover(6, 46, 2.4, 0.9, 0, "low", "rock");
  b.block(9, 63, 4, 4, 0, 2.8, "rock", { ledges: ["s", "w"] }); // sniper rock
  b.arena("approach", [-14, -1, -14], [14, 7, 72]);
  b.enemy("rifleman", [-4, 0, 24], 90, "approach", { patrol: [[-4, 0, 24], [6, 0, 24], [6, 0, 14], [-4, 0, 14]] });
  b.enemy("rifleman", [2, 0, 48], 270, "approach", { patrol: [[2, 0, 48], [-10, 0, 48]] });
  b.enemy("sniper", [9, 2.8, 63], 180, "approach");
  b.enemy("brute", [-6, 0, 64], 160, "approach", { patrol: [[-6, 0, 64], [0, 0, 56]] });
  b.pickup([-12, 0.3, 2], "bottle", 2);
  b.pickup([11, 0.3, 30], "ammo", 20);
  b.treasure("ch05-icon", [-11, 0.4, 47], "Enamel Travel Icon", "A saint the size of a thumbnail, folded into a brass case. Pilgrims carried these up the mountain.");
  b.treasure("ch05-crampon", [10.5, 3.2, 64], "Pilgrim's Crampon", "Iron spikes on a leather strap, hand-forged. Someone climbed this mountain without it and regretted it.");

  // --- 2. Cliff climb ---------------------------------------------------------------------
  b.box([-14, 0, 72], [14, 18, 186], "rock", { ledges: ["s"] });
  b.checkpoint("c2", [0, 0, 69], 0, "Foot of the Cliff");
  b.handholds("z", 72, -1, 3, -3, [1.8, 3.6, 5.4, 7.2, 9.0, 10.8, 12.6, 14.4, 16.2], 1.4, [4]);
  b.trigger([-14, 0, 64], [14, 3, 70], "cliff");
  b.treasure("ch05-rosary", [12.5, 18.4, 74], "Bone Rosary", "Forty beads of carved bone and one of red coral, out of place and very old.");

  // --- 3. Monastery courtyard -------------------------------------------------------------
  b.walls(14, 72, 190, 18, 44);
  b.checkpoint("c3", [0, 18, 76], 0, "Monastery Gate");
  b.trigger([-14, 18, 80], [14, 21, 83], "court");
  b.cover(-6, 92, 3, 0.9, 18, "low", "stone");
  b.cover(5, 96, 0.9, 3, 18, "high", "stone");
  b.cover(-9, 106, 0.9, 3, 18, "high", "stone");
  b.cover(1, 110, 3, 0.9, 18, "low", "wood", 60);
  b.cover(8, 118, 3, 0.9, 18, "low", "stone");
  b.cover(-4, 124, 3, 0.9, 18, "low", "stone");
  b.barrel(-1, 101, 18);
  b.pickup([-12.5, 18.3, 86], "weapon", 30, "rifle");
  b.pickup([12.5, 18.3, 100], "ammo", 30);
  b.pickup([0, 18.3, 132], "grenade", 2);
  b.arena("court", [-14, 17, 84], [14, 23, 136]);
  b.enemy("rifleman", [-5, 18, 114], 180, "court", { patrol: [[-5, 18, 114], [6, 18, 114]] });
  b.enemy("rifleman", [9, 18, 126], 200, "court");
  b.enemy("grenadier", [-9, 18, 130], 160, "court");
  b.enemy("shotgunner", [3, 18, 128], 180, "court", { wave: "court2", alerted: true });
  b.enemy("heavy", [0, 18, 134], 180, "court", { wave: "court2", alerted: true });

  // --- 4. Bell tower ----------------------------------------------------------------------
  b.box([-5, 18, 140], [5, 30, 152], "stone", { ledges: ["s"] });
  b.handholds("z", 140, -1, -2, 2, [19.8, 21.6, 23.4, 25.2, 27.0, 28.6], 1.4);
  b.checkpoint("c4", [0, 30, 143], 0, "Belfry");
  b.interact("note", [-3.6, 31, 142], "examine", "Read the bell-ringer's note", "note", { once: false });
  b.interact("hymn", [0, 31, 142], "examine", "Play the hymn on the old music box", "hymn", { once: false });
  b.interact("bell0", [-3.6, 31, 148], "bell", "Ring bell 1 (lowest)", "bell", { once: false, radius: 1.4 });
  b.interact("bell1", [-1.2, 31, 148], "bell", "Ring bell 2", "bell", { once: false, radius: 1.4 });
  b.interact("bell2", [1.2, 31, 148], "bell", "Ring bell 3", "bell", { once: false, radius: 1.4 });
  b.interact("bell3", [3.6, 31, 148], "bell", "Ring bell 4 (highest)", "bell", { once: false, radius: 1.4 });
  b.treasure("ch05-clapper", [4.2, 30.4, 151.2], "Silver Bell Clapper", "Too small for these bells. Engraved with a compass rose pointing to a different north.");
  b.zipline([0, 32.4, 151.8], [0, 20.4, 174]);

  // North wall and the gate that opens after the puzzle.
  b.box([-14, 18, 178], [-4, 30, 180], "stone");
  b.box([4, 18, 178], [14, 30, 180], "stone");
  b.box([-4, 18, 178], [4, 24, 180], "wood", { group: "northgate" });
  b.checkpoint("c5", [0, 18, 175], 0, "North Gate");

  // --- 5. Avalanche run -------------------------------------------------------------------
  b.box([-6, 17, 186], [6, 18, 188], "snow");
  b.ramp([-6, 6, 188], [6, 18, 248], "z", -1, "ground");
  b.box([-8, 5, 248], [8, 6, 290], "snow");
  b.walls(6, 186, 290, 0, 40);
  b.box([-8, 9.6, 268], [8, 14, 290], "rock"); // cave roof
  b.box([-10, 0, 290], [10, 30, 294], "rock");
  b.trigger([-6, 18, 186], [6, 21, 188], "avalanche");
  b.hazard("avalanche", "avalanche", [-8, -5, 160], [8, 50, 172], { vel: [0, 0, 6], travel: 96, startActive: false, warn: "Avalanche! Run downhill!" });
  b.checkpoint("c6", [0, 6, 280], 0, "Ice Cave");
  b.trigger([-8, 6, 274], [8, 9, 276], "safe");
  b.treasure("ch05-chart", [0, 6.4, 287], "Second Chart Half", "The missing half of Catalina's chart, folded inside a waxed bell-rope bag. The torn edges match perfectly.");

  return b.build();
}

export const ch05Script: ChapterScript = {
  parTimeMinutes: 30,
  startLoadout: { sidearm: "pistol", long: "rifle", sidearmAmmo: 30, longAmmo: 60, grenades: 1, bottles: 1 },
  onStart: [
    { type: "music", mood: "tension" },
    { type: "stealth", active: true },
    { type: "objective", text: "Reach the foot of the monastery cliff", target: { x: 0, y: 0, z: 68 } },
    {
      type: "dialogue",
      lines: [
        { speaker: "Bram", text: "Saint Aurel. Abandoned for sixty years and somehow the Gilt Company got here first." },
        { speaker: "Ines", text: "Snow's coming down hard." },
        { speaker: "Bram", text: "Good. They'll see half as far. Just don't trip over one of them." },
      ],
    },
  ],
  events: {
    "tut:snow": [{ type: "tutorial", text: "Falling snow hides you at a distance and muffles your footsteps. Guards still see you up close." }],
    cliff: [
      { type: "stealth", active: false },
      { type: "objective", text: "Climb the cliff to the monastery", target: { x: 0, y: 18, z: 74 } },
      { type: "dialogue", lines: [{ speaker: "Ines", text: "Pilgrims cut handholds into the rock. Some of them a long time ago." }] },
    ],
    court: [
      { type: "music", mood: "combat" },
      { type: "objective", text: "Clear the courtyard and reach the bell tower", target: { x: 0, y: 18, z: 138 } },
      { type: "dialogue", lines: [{ speaker: "Gilt Radio", text: "Courtyard team, check in. Anyone seen the woman from the desert?" }] },
    ],
    "waveClear:court": [
      { type: "spawn", wave: "court2" },
      { type: "dialogue", lines: [{ speaker: "Bram", text: "More coming through the cloister. Big one with them!" }] },
    ],
    "waveClear:court2": [
      { type: "music", mood: "explore" },
      { type: "objective", text: "Climb the bell tower", target: { x: 0, y: 30, z: 142 } },
    ],
    note: [
      { type: "journal", id: "hymn" },
      { type: "objective", text: "Ring the bells in the order of the hymn", target: { x: 0, y: 31, z: 148 } },
      { type: "dialogue", lines: [{ speaker: "Ines", text: "The ringer wrote the hymn down. And there's a music box that still plays it." }] },
    ],
    hymn: [],
    bell: [],
    bells_solved: [
      { type: "journal", id: "chart" },
      { type: "remove", group: "northgate" },
      { type: "checkpoint", id: "c5" },
      {
        type: "cutscene",
        shots: [{ from: { x: 3, y: 33, z: 144 }, to: { x: -3, y: 33, z: 144 }, target: { x: 0, y: 31, z: 149 }, duration: 4 }],
        lines: [
          { speaker: "Ines", text: "The big bell's hollow. There's something inside." },
          { speaker: "Bram", text: "And the whole mountain heard you ring it. The snow's moving, Ines!" },
        ],
      },
      { type: "music", mood: "tension" },
      { type: "objective", text: "Ride the bell rope down and get out through the north gate", target: { x: 0, y: 18, z: 182 } },
      { type: "tutorial", text: "Stand by the rope at the edge of the belfry and press Interact to ride it down.", action: "interact" },
    ],
    avalanche: [
      { type: "hazard", id: "avalanche", active: true },
      { type: "music", mood: "combat" },
      { type: "shake", amount: 1 },
      { type: "tutorial", text: "Sprint! Don't stop until you reach the cave.", action: "sprint" },
    ],
    safe: [
      { type: "hazard", id: "avalanche", active: false },
      { type: "music", mood: "wonder" },
      {
        type: "cutscene",
        shots: [{ from: { x: 0, y: 8, z: 276 }, to: { x: 0, y: 7.5, z: 281 }, target: { x: 0, y: 6.5, z: 287 }, duration: 5 }],
        lines: [
          { speaker: "Bram", text: "You alive in there?" },
          { speaker: "Ines", text: "Alive, and holding both halves. The chart points north-east. A railway runs that way." },
          { speaker: "Bram", text: "The night train to Varanask. Gilt will be on it. They always are." },
        ],
      },
      { type: "emit", event: "end", delay: 5.5 },
    ],
    end: [{ type: "complete" }],
  },
  puzzles: [
    {
      id: "bells",
      type: "bells",
      bells: ["bell0", "bell1", "bell2", "bell3"],
      order: [0, 2, 1, 3],
      listen: "hymn",
      onSolve: "bells_solved",
      hint: "The hymn goes: lowest bell, third bell, second bell, highest bell.",
    },
  ],
  journal: [
    {
      id: "hymn",
      title: "The Ringer's Note",
      text: "'Four bells, four steps to heaven: begin at the bottom, leap past the second, step back to it, then rise to the top.' Bells are numbered 1 (lowest) to 4 (highest), left to right.",
      sketch: [[15, 80, 15, 60], [40, 80, 40, 50], [65, 80, 65, 40], [90, 80, 90, 30]],
    },
    {
      id: "chart",
      title: "The Whole Chart",
      text: "Both halves together show a sea route ending at no island at all: just a circle of open water marked 'Meridia, que el mar guarda' (Meridia, which the sea keeps).",
      sketch: [[20, 20, 80, 20], [80, 20, 80, 80], [80, 80, 20, 80], [20, 80, 20, 20], [50, 50, 58, 50], [50, 50, 50, 42]],
    },
  ],
};
