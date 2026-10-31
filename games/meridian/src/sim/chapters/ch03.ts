// Chapter 3 — The Green Vault
// Jungle ruins: stealth in tall grass, a free-climb temple wall, a pillar puzzle, a collapsing
// bridge escape, a grapple swing, and a boss fight against Kessa Varn at the vault door.

import { LevelBuilder } from "../world/LevelBuilder";
import type { ChapterScript } from "../story/types";

export function buildCh03() {
  const b = new LevelBuilder("ch03", { top: "#6fa86b", bottom: "#d9e6c3", fog: "#a9c9a0", fogDensity: 0.012 });

  // --- 1. Jungle path (stealth) -----------------------------------------------------------
  b.box([-12, -8, -16], [12, 26, -12], "rock");
  b.walls(10, -14, 44);
  b.box([-10, -1, -12], [10, 0, 44], "ground");
  b.checkpoint("c1", [0, 0, -6], 0, "Serra Verde Trail");
  b.grass([-10, 0, 0], [-4, 1.5, 14]);
  b.grass([4, 0, 6], [10, 1.5, 20]);
  b.grass([-6, 0, 24], [2, 1.5, 32]);
  b.cover(-1, 10, 2.4, 1.0, 0, "low", "stone");
  b.cover(5, 26, 1, 3, 0, "high", "stone");
  b.cover(-6, 36, 3, 1, 0, "low", "stone");
  b.block(2, 3, 1.4, 1.4, 0, 2.2, "foliage"); // tree trunks
  b.block(-7, 20, 1.4, 1.4, 0, 2.2, "foliage");
  b.block(7, 34, 1.4, 1.4, 0, 2.2, "foliage");
  b.arena("jungle", [-10, -1, -12], [10, 3, 43]);
  b.enemy("rifleman", [-5, 0, 18], 90, "jungle", { patrol: [[-5, 0, 18], [5, 0, 18], [5, 0, 30], [-5, 0, 30]] });
  b.enemy("rifleman", [6, 0, 40], 180, "jungle");
  b.enemy("brute", [0, 0, 36], 200, "jungle", { patrol: [[0, 0, 36], [-7, 0, 40], [0, 0, 40]] });
  b.pickup([3, 0.3, -2], "bottle", 2);
  b.treasure("ch03-idol", [8, 0.4, 10], "Jade Frog Idol", "Carved jade, palm-sized. Its eyes are inlaid with tiny chips of mother-of-pearl.");

  // Optional wall-jump chimney to a treasure perch.
  b.box([-10, 0, 17], [-6, 5.5, 18], "stone", { wallJump: true, ledges: ["n"] });
  b.box([-10, 0, 20], [-6, 5.5, 22], "stone", { wallJump: true, ledges: ["s"] });
  b.treasure("ch03-feather", [-8, 5.9, 21], "Quetzal Feather Fan", "Brilliant green feathers bound with gold wire. Somehow still vivid after centuries.");
  b.trigger([-10, 0, 18], [-6, 3, 20], "tut:walljump");

  // --- 2. Temple facade (free climb) ------------------------------------------------------
  b.box([-10, 0, 44], [10, 8, 70], "stone");
  b.climbWall([-3, 0, 43.9], [3, 8, 44], [0, 0, -1]);
  b.trigger([-10, 0, 38], [10, 3, 43.5], "tut:climbwall");
  b.walls(10, 44, 130);

  // --- 3. Pillar puzzle -------------------------------------------------------------------
  b.checkpoint("c2", [0, 8, 47], 0, "Temple Terrace");
  b.interact("carving", [0, 9.4, 50.5], "examine", "Read the carving", "carving", { once: false });
  b.block(0, 51, 4, 0.6, 8, 10.5, "stone");
  b.interact("pillar_l", [-5, 9, 57.2], "pillar", "Turn the left pillar", "pillar", { once: false });
  b.interact("pillar_c", [0, 9, 61.2], "pillar", "Turn the centre pillar", "pillar", { once: false });
  b.interact("pillar_r", [5, 9, 57.2], "pillar", "Turn the right pillar", "pillar", { once: false });
  b.block(-5, 58, 1, 1, 8, 10.2, "stone");
  b.block(0, 62, 1, 1, 8, 10.2, "stone");
  b.block(5, 58, 1, 1, 8, 10.2, "stone");
  b.treasure("ch03-mask", [-9, 8.4, 52], "Sun Disc Mask", "Hammered gold, the face calm and wide-eyed. The back is engraved with a star chart.");
  b.checkpoint("c3", [0, 8, 67.5], 0, "Bridge of Teeth");

  // --- 4. Collapsing bridge ---------------------------------------------------------------
  for (let i = 0; i < 6; i++) {
    b.box([-1.5, 7.2, 70 + i * 5], [1.5, 8, 75 + i * 5], "stone", { group: `b${i + 1}`, hidden: true });
  }
  b.trigger([-1.5, 8, 76], [1.5, 10, 78], "bridge_run");
  b.box([-10, 1, 100], [10, 8, 130], "stone", { ledges: ["s"] });
  b.checkpoint("c4", [0, 8, 108], 0, "Far Ledge");

  // --- 5. Grapple gap ---------------------------------------------------------------------
  b.rope([0, 15, 134.5], 0, true);
  b.trigger([-10, 8, 124], [10, 11, 130], "tut:grapple");

  // --- 6. Vault arena (boss) --------------------------------------------------------------
  b.box([-14, 1, 139], [14, 8, 186], "stone", { ledges: ["s"] });
  b.walls(14, 130, 200);
  b.checkpoint("c5", [0, 8, 142], 0, "Vault Steps");
  b.trigger([-14, 8, 146], [14, 11, 149], "boss_enter");
  b.cover(-5, 152, 3, 0.8, 8, "low");
  b.cover(6, 154, 0.8, 3, 8, "high");
  b.cover(-10, 160, 0.8, 3, 8, "high");
  b.cover(1, 161, 3, 0.8, 8, "low", "wood", 60);
  b.cover(9, 165, 3, 0.8, 8, "low");
  b.cover(-3, 168, 3, 0.8, 8, "low");
  b.cover(4, 173, 0.8, 3, 8, "high");
  b.cover(-9, 174, 3, 0.8, 8, "low");
  b.barrel(-2, 157, 8);
  b.barrel(8.6, 168, 8);
  b.barrel(-9.5, 180, 8);
  b.crate(-6, 166, 8, 1.2);
  b.crate(6, 160, 8, 1.2);
  b.pickup([-12.5, 8.4, 143], "weapon", 30, "rifle");
  b.pickup([12.5, 8.4, 143], "weapon", 5, "marksman");
  b.pickup([0, 8.3, 150], "ammo", 30);
  b.pickup([-12, 8.3, 165], "grenade", 2);
  b.pickup([12, 8.3, 170], "ammo", 30);
  b.pickup([0, 8.3, 176], "ammo", 30);
  b.treasure("ch03-codex", [-12.5, 8.4, 182], "Ordaz Logbook Page", "A torn page in Catalina's hand: 'Three keys for three seas. The first lies sleeping in green stone.'");
  b.arena("vault", [-14, 7, 139], [14, 12, 186]);
  b.enemy("lieutenant", [0, 8, 180], 180, "vault", { wave: "boss1", alerted: true });
  b.enemy("rifleman", [-8, 8, 181], 180, "vault", { wave: "boss1", alerted: true });
  b.enemy("rifleman", [8, 8, 181], 180, "vault", { wave: "boss1", alerted: true });
  b.enemy("brute", [-10, 8, 184], 180, "vault", { wave: "boss2", alerted: true });
  b.enemy("grenadier", [10, 8, 184], 180, "vault", { wave: "boss2", alerted: true });
  b.enemy("shotgunner", [-6, 8, 184], 180, "vault", { wave: "boss3", alerted: true });
  b.enemy("rifleman", [6, 8, 184], 180, "vault", { wave: "boss3", alerted: true });

  // --- 7. Vault door (pressure plates) ----------------------------------------------------
  b.box([-14, 8, 186], [-2.5, 16, 188], "stone");
  b.box([2.5, 8, 186], [14, 16, 188], "stone");
  b.box([-2.5, 8, 186], [2.5, 13, 188], "metal", { group: "vaultdoor" });
  b.box([-2.5, 13, 186], [2.5, 16, 188], "stone");
  b.box([-8, 1, 188], [8, 8, 200], "stone");
  b.walls(8, 188, 202);
  b.box([-10, 0, 200], [10, 26, 204], "rock");
  b.trigger([-8, 8, 192], [8, 11, 196], "vault");
  b.treasure("ch03-key", [0, 8.5, 198], "Green Stone Key", "Not gold. Not jewels. A key of carved serpentine, warm to the touch.");

  return b.build();
}

export const ch03Script: ChapterScript = {
  parTimeMinutes: 28,
  startLoadout: { sidearm: "revolver", long: null, sidearmAmmo: 24, grenades: 1, bottles: 0 },
  onStart: [
    { type: "music", mood: "tension" },
    { type: "stealth", active: true },
    { type: "objective", text: "Reach the temple", target: { x: 0, y: 0, z: 43 } },
    {
      type: "dialogue",
      lines: [
        { speaker: "Bram", text: "I'll circle with the boat. Radio's patchy under the canopy." },
        { speaker: "Ines", text: "Gilt patrols ahead. Big one too. I'm not punching that." },
        { speaker: "Bram", text: "Tall grass is your friend. Crouch and they won't see a thing." },
      ],
    },
  ],
  events: {
    "tut:walljump": [
      { type: "tutorial", text: "Jump into a wall, then press Jump again as you touch it to kick off. Bounce between the walls to climb.", action: "jump" },
    ],
    "tut:climbwall": [
      { type: "stealth", active: false },
      { type: "tutorial", text: "Carved walls can be free-climbed. Jump at the wall to grab on, then move in any direction.", action: "jump" },
      { type: "objective", text: "Climb the temple wall", target: { x: 0, y: 8, z: 46 } },
    ],
    carving: [
      { type: "journal", id: "carving" },
      { type: "dialogue", lines: [{ speaker: "Ines", text: "Star on the left, moon in the middle, wave on the right. The pillars must match." }] },
      { type: "objective", text: "Turn the pillars to match the carving", target: { x: 0, y: 9, z: 59 } },
    ],
    pillar: [],
    pillars_solved: [
      { type: "reveal", group: "b1" },
      { type: "reveal", group: "b2" },
      { type: "reveal", group: "b3" },
      { type: "reveal", group: "b4" },
      { type: "reveal", group: "b5" },
      { type: "reveal", group: "b6" },
      { type: "shake", amount: 0.8 },
      { type: "checkpoint", id: "c3" },
      { type: "objective", text: "Cross the stone bridge", target: { x: 0, y: 8, z: 102 } },
      { type: "dialogue", lines: [{ speaker: "Ines", text: "A bridge, rising out of the mist. Catalina, you show-off." }] },
    ],
    bridge_run: [
      { type: "music", mood: "combat" },
      { type: "shake", amount: 1 },
      { type: "dialogue", lines: [{ speaker: "Ines", text: "It's falling apart behind me! Run!" }] },
      { type: "tutorial", text: "Sprint! Hold Sprint (or double-tap forward with toggle sprint on) to run faster.", action: "sprint" },
      { type: "remove", group: "b1", delay: 0.3 },
      { type: "remove", group: "b2", delay: 1.0 },
      { type: "remove", group: "b3", delay: 2.0 },
      { type: "remove", group: "b4", delay: 2.9 },
      { type: "remove", group: "b5", delay: 3.8 },
      { type: "remove", group: "b6", delay: 4.7 },
    ],
    "tut:grapple": [
      { type: "music", mood: "explore" },
      { type: "tutorial", text: "When the grapple icon appears, press Interact to throw your hook, swing, and press Jump to let go.", action: "interact" },
      { type: "objective", text: "Swing across to the vault", target: { x: 0, y: 8, z: 142 } },
    ],
    boss_enter: [
      { type: "music", mood: "combat" },
      { type: "spawn", wave: "boss1" },
      {
        type: "cutscene",
        shots: [{ from: { x: 0, y: 10, z: 146 }, to: { x: 0, y: 10.5, z: 150 }, target: { x: 0, y: 9, z: 180 }, duration: 4 }],
        lines: [
          { speaker: "Kessa", text: "Varek said you'd come. He says a lot of things. Let's see if this one's true." },
          { speaker: "Ines", text: "Kessa Varn. I've read your file. It's mostly fire damage." },
        ],
      },
      { type: "objective", text: "Defeat Kessa Varn", target: { x: 0, y: 8, z: 178 } },
    ],
    "bossPhase:2": [
      { type: "spawn", wave: "boss2" },
      { type: "dialogue", lines: [{ speaker: "Kessa", text: "Brute! Grenades! Get her out of that cover!" }] },
    ],
    "bossPhase:3": [
      { type: "spawn", wave: "boss3" },
      { type: "dialogue", lines: [{ speaker: "Kessa", text: "Enough. I'll do it myself." }, { speaker: "Bram", text: "She's switched to a shotgun. Keep your distance!" }] },
    ],
    "arenaClear:vault": [
      { type: "music", mood: "wonder" },
      { type: "objective", text: "Weigh down both pressure plates to open the vault door", target: { x: 0, y: 8, z: 179 } },
      { type: "dialogue", lines: [{ speaker: "Ines", text: "Two plates by the door. Those crates should be heavy enough." }] },
      { type: "tutorial", text: "Hold Interact by a crate and push it onto a plate. You can stand on the other one yourself." },
    ],
    plates_solved: [
      { type: "remove", group: "vaultdoor" },
      { type: "objective", text: "Enter the Green Vault", target: { x: 0, y: 8, z: 194 } },
    ],
    vault: [
      { type: "journal", id: "vault" },
      {
        type: "cutscene",
        shots: [
          { from: { x: 0, y: 10, z: 190 }, to: { x: 0, y: 9.5, z: 193 }, target: { x: 0, y: 8.5, z: 198 }, duration: 5 },
          { from: { x: 4, y: 9, z: 196 }, to: { x: -4, y: 9, z: 196 }, target: { x: 0, y: 8.5, z: 198 }, duration: 5 },
        ],
        lines: [
          { speaker: "Ines", text: "No gold. Just a key. Green stone, carved with the meridian." },
          { speaker: "Ines", text: "'Three keys for three seas.' This is only the first." },
          { speaker: "Varek", text: "Then we will have such fun finding the other two. Together, or otherwise." },
        ],
      },
      { type: "emit", event: "end", delay: 10.5 },
    ],
    end: [{ type: "complete" }],
  },
  puzzles: [
    {
      id: "pillars",
      type: "pillars",
      pillars: ["pillar_l", "pillar_c", "pillar_r"],
      initial: [0, 0, 0],
      solution: [2, 1, 3],
      onSolve: "pillars_solved",
      hint: "Each pillar shows sun, moon, star, wave in turn. The carving reads: star (left), moon (centre), wave (right).",
    },
    {
      id: "plates",
      type: "plates",
      plates: [
        { min: { x: -6.8, y: 7.9, z: 177.2 }, max: { x: -5.2, y: 8.6, z: 178.8 } },
        { min: { x: 5.2, y: 7.9, z: 177.2 }, max: { x: 6.8, y: 8.6, z: 178.8 } },
      ],
      onSolve: "plates_solved",
      hint: "Push a crate onto one plate and stand on the other.",
    },
  ],
  journal: [
    {
      id: "carving",
      title: "The Pillar Carving",
      text: "Three symbols cut above the pillars: a STAR on the left, a MOON in the centre, a WAVE on the right. Each pillar turns through sun, moon, star and wave.",
      sketch: [[15, 40, 35, 40], [25, 30, 25, 50], [50, 35, 50, 45], [65, 45, 75, 40], [75, 40, 85, 45]],
    },
    {
      id: "vault",
      title: "The First Key",
      text: "Inside the Green Vault: a serpentine key cut with the same meridian as the astrolabe. Catalina hid three keys across three seas. Together they open the Drowned City of Meridia.",
      sketch: [[30, 50, 70, 50], [70, 50, 70, 60], [60, 50, 60, 58], [20, 40, 30, 50], [20, 60, 30, 50]],
    },
  ],
};
