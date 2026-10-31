// Chapter 4 — Salt Road
// A night caravan camp to sneak through, a jeep chase across the salt flats (Ines drives, then
// mans the gun when Bram takes the wheel), an ambush inside a sandstorm, and a climb up a ruined
// waystation tower to a lever puzzle and a hidden shrine.

import { LevelBuilder } from "../world/LevelBuilder";
import type { ChapterScript } from "../story/types";

export function buildCh04() {
  const b = new LevelBuilder("ch04", { top: "#2b3550", bottom: "#c9a46a", fog: "#8c7a63", fogDensity: 0.006 });

  // One big salt flat under everything.
  b.box([-60, -1, -14], [60, 0, 900], "sand");

  // --- 1. Caravan camp (stealth) ----------------------------------------------------------
  b.box([-16, -1, -16], [16, 20, -12], "rock");
  b.walls(14, -14, 60);
  b.checkpoint("c1", [0, 0, -6], 0, "Caravan Camp");
  b.grass([-12, 0, 2], [-6, 1.4, 14]); // dry scrub
  b.grass([6, 0, 16], [12, 1.4, 30]);
  b.grass([-10, 0, 34], [-2, 1.4, 44]);
  b.trigger([-14, 0, -2], [14, 3, 1], "tut:scrub");
  // Tents and wagons.
  b.block(-4, 8, 4, 3, 0, 2.4, "plaster", { cover: "high" });
  b.block(5, 10, 3, 2, 0, 1.1, "wood", { cover: "low" });
  b.block(-6, 26, 3, 4, 0, 2.4, "plaster", { cover: "high", ledges: ["e"] });
  b.block(2, 30, 2.4, 1, 0, 1.05, "wood", { cover: "low" });
  b.block(8, 42, 4, 3, 0, 2.4, "plaster", { cover: "high" });
  b.block(-3, 48, 2.4, 1, 0, 1.05, "wood", { cover: "low" });
  b.arena("camp", [-14, -1, -12], [14, 4, 60]);
  b.enemy("rifleman", [-2, 0, 18], 90, "camp", { patrol: [[-2, 0, 18], [8, 0, 18], [8, 0, 24], [-2, 0, 24]] });
  b.enemy("rifleman", [4, 0, 36], 180, "camp", { patrol: [[4, 0, 36], [-8, 0, 36]] });
  b.enemy("shotgunner", [-8, 0, 50], 120, "camp");
  b.enemy("brute", [9, 0, 52], 200, "camp");
  b.pickup([-9, 0.3, 4], "bottle", 2);
  b.pickup([10, 0.3, 12], "ammo", 15);
  b.treasure("ch04-lamp", [-10.5, 0.4, 42], "Brass Caravan Lamp", "Pierced brass throws a lace of light across the sand. Someone kept it polished for a hundred years.");
  b.treasure("ch04-coin", [-6, 2.8, 26], "Salt Road Dinar", "A silver coin worn smooth on one side. The other shows a ship under a single star.");
  // Bram's jeep at the edge of camp.
  b.checkpoint("c2", [-2.5, 0, 56], 0, "Bram's Jeep");
  b.interact("jeep", [0, 1, 60], "vehicle", "Get in the jeep", "jeep", { radius: 2.4 });

  // --- 2. Jeep chase across the flats -----------------------------------------------------
  // Part one: Ines drives, weaving between rocks.
  b.track("road1", [[0, 0, 62], [0, 0, 140], [18, 0, 200], [18, 0, 260], [-10, 0, 330], [-10, 0, 400], [0, 0, 430]], 12, "drive", 20, "chase1_end");
  // Rocks and a burned-out truck block parts of the road, so the player has to pick a lane.
  b.box([-6, 0, 94], [-1, 2, 97], "rock");
  b.box([-1, 0, 118], [4, 2, 121], "rock");
  b.box([15, 0, 224], [20, 2.2, 227], "rock");
  b.box([16, 0, 244], [22, 2.2, 247], "rock");
  b.box([-13, 0, 358], [-7, 1.8, 362], "metal");
  b.box([-15, 0, 390], [-10, 1.8, 393], "rock");
  b.pursuer("road1", "chase1", -14, 3);
  b.pursuer("road1", "chase1", -22, -3);
  // Part two: Bram drives, Ines shoots from the back.
  b.track("road2", [[0, 0, 432], [12, 0, 480], [12, 0, 560], [0, 0, 600], [0, 0, 640]], 12, "gunner", 17, "chase2_end");
  b.pursuer("road2", "chase2", -12, 3, 140);
  b.pursuer("road2", "chase2", -18, -3, 140);
  b.pursuer("road2", "chase2", -26, 1, 180);

  // --- 3. Sandstorm ambush in the ruins ---------------------------------------------------
  b.walls(16, 644, 766);
  b.checkpoint("c3", [0, 0, 648], 0, "Edge of the Storm");
  b.weather("storm", "sandstorm", [-30, -1, 630], [30, 30, 768], { startActive: false, wind: [0.9, 0, 0] });
  b.cover(-6, 664, 3, 0.9, 0, "low", "stone");
  b.cover(5, 670, 0.9, 3, 0, "high", "stone");
  b.cover(-10, 682, 0.9, 3, 0, "high", "stone");
  b.cover(2, 690, 3, 0.9, 0, "low", "stone");
  b.cover(10, 700, 3, 0.9, 0, "low", "wood", 60);
  b.cover(-4, 712, 0.9, 3, 0, "high", "stone");
  b.cover(6, 724, 3, 0.9, 0, "low", "stone");
  b.cover(-8, 736, 3, 0.9, 0, "low", "stone");
  b.barrel(-2, 704, 0);
  b.barrel(9, 732, 0);
  b.pickup([-13, 0.3, 660], "ammo", 30);
  b.pickup([13, 0.3, 690], "grenade", 2);
  b.pickup([-12, 0.3, 720], "weapon", 6, "shotgun");
  b.pickup([0, 0.3, 745], "ammo", 30);
  b.treasure("ch04-astro", [13.5, 0.4, 742], "Pocket Sand-Glass", "A traveller's hourglass in a brass cage. The sand inside is black and glitters like crushed stars.");
  b.arena("storm", [-16, -1, 644], [16, 5, 766]);
  b.enemy("rifleman", [-6, 0, 696], 180, "storm", { wave: "storm1" });
  b.enemy("rifleman", [7, 0, 706], 180, "storm", { wave: "storm1" });
  b.enemy("shotgunner", [-9, 0, 716], 160, "storm", { wave: "storm1" });
  b.enemy("grenadier", [4, 0, 740], 180, "storm", { wave: "storm1" });
  b.enemy("heavy", [0, 0, 756], 180, "storm", { wave: "storm2", alerted: true });
  b.enemy("rifleman", [-10, 0, 752], 180, "storm", { wave: "storm2", alerted: true });
  b.enemy("rifleman", [10, 0, 752], 180, "storm", { wave: "storm2", alerted: true });
  b.trigger([-16, 0, 724], [16, 3, 727], "storm_ambush");

  // --- 4. Waystation tower (climb + lever puzzle) -----------------------------------------
  b.walls(12, 766, 860);
  b.checkpoint("c4", [0, 0, 776], 0, "Waystation");
  b.box([-6, 0, 790], [6, 10, 812], "stone", { ledges: ["s"] });
  b.handholds("z", 790, -1, -2, -2, [1.8, 3.6, 5.4, 7.2, 8.6], 1.4);
  b.trigger([-12, 0, 782], [12, 3, 788], "tut:tower");
  b.checkpoint("c5", [0, 10, 793], 0, "Tower Top");
  b.interact("inscription", [0, 11, 796], "examine", "Read the sun inscription", "inscription", { once: false });
  b.block(0, 797, 3, 0.6, 10, 11.6, "stone");
  b.interact("lv_dawn", [4.5, 11, 806], "lever", "Pull the eastern lever", "lever", { once: false });
  b.interact("lv_noon", [0, 11, 808], "lever", "Pull the middle lever", "lever", { once: false });
  b.interact("lv_dusk", [-4.5, 11, 806], "lever", "Pull the western lever", "lever", { once: false });
  b.treasure("ch04-scope", [-5.2, 10.4, 811], "Navigator's Spyglass", "Three brass draws, one cracked lens. Scratched on the barrel: 'C. de O. — Look west.'");
  // Bridge that rises when the levers are pulled in order.
  b.box([-1.5, 9.4, 812], [1.5, 10, 830], "stone", { group: "wsbridge", hidden: true });
  // Cliff shrine.
  b.box([-12, 0, 830], [12, 10, 860], "rock");
  b.box([-14, 0, 860], [14, 24, 864], "rock");
  b.checkpoint("c6", [0, 10, 836], 0, "Cliff Shrine");
  b.trigger([-12, 10, 846], [12, 13, 850], "shrine");
  b.treasure("ch04-chart", [0, 10.5, 856], "Star Chart Fragment", "Half a chart inked on sharkskin. The other half was torn away along a perfectly straight line.");

  return b.build();
}

export const ch04Script: ChapterScript = {
  parTimeMinutes: 30,
  startLoadout: { sidearm: "pistol", long: null, sidearmAmmo: 30, grenades: 0, bottles: 1 },
  onStart: [
    { type: "music", mood: "tension" },
    { type: "stealth", active: true },
    { type: "objective", text: "Sneak through the caravan camp to Bram's jeep", target: { x: 0, y: 0, z: 58 } },
    {
      type: "dialogue",
      lines: [
        { speaker: "Bram", text: "Jeep's on the far side of the camp. Gilt took over the whole caravan." },
        { speaker: "Ines", text: "They're guarding a codex page they can't even read." },
        { speaker: "Bram", text: "Then let's not wake them. Stay low in the scrub." },
      ],
    },
  ],
  events: {
    "tut:scrub": [{ type: "tutorial", text: "Dry scrub works like tall grass. Crouch inside it and guards can't see you.", action: "crouch" }],
    jeep: [
      { type: "stealth", active: false },
      { type: "music", mood: "combat" },
      {
        type: "cutscene",
        shots: [{ from: { x: 6, y: 3, z: 54 }, to: { x: 4, y: 2.5, z: 58 }, target: { x: 0, y: 1, z: 62 }, duration: 3 }],
        lines: [
          { speaker: "Gilt Radio", text: "Engine noise, east side! Get the trucks moving!" },
          { speaker: "Bram", text: "So much for quiet. You drive, I'll navigate. Go, go!" },
        ],
      },
      { type: "vehicle", track: "road1" },
      { type: "emit", event: "chase1_pursuit", delay: 3 },
      { type: "tutorial", text: "Push the stick forward to drive, left and right to steer. Hold Sprint for a boost. Steer around the rocks!" },
      { type: "objective", text: "Outrun the Gilt jeeps" },
    ],
    chase1_end: [
      { type: "dialogue", lines: [{ speaker: "Bram", text: "They shot out the tyre! Swap! I've driven on worse. Rifle's under the seat. Get on it!" }] },
      { type: "give", weapon: "rifle", ammo: 120 },
      { type: "vehicle", track: "road2" },
      { type: "emit", event: "chase2_pursuit", delay: 2 },
      { type: "tutorial", text: "Bram is driving. Aim and fire at the jeeps behind you. Hit the gunner for a faster kill.", action: "aim" },
      { type: "objective", text: "Shoot down the pursuing jeeps" },
    ],
    chase1_pursuit: [{ type: "pursuit", group: "chase1" }, { type: "dialogue", lines: [{ speaker: "Bram", text: "Two jeeps behind us! Don't let them get alongside!" }] }],
    chase2_pursuit: [{ type: "pursuit", group: "chase2" }],
    "pursuitClear:chase2": [{ type: "dialogue", lines: [{ speaker: "Ines", text: "That's the last of them!" }, { speaker: "Bram", text: "Don't celebrate yet. Look at the sky." }] }],
    chase2_end: [
      { type: "checkpoint", id: "c3" },
      { type: "weather", id: "storm", active: true },
      { type: "spawn", wave: "storm1" },
      { type: "music", mood: "tension" },
      { type: "objective", text: "Push through the ruins to the waystation", target: { x: 0, y: 0, z: 770 } },
      {
        type: "dialogue",
        lines: [
          { speaker: "Bram", text: "Sandstorm. Jeep won't make it. We walk." },
          { speaker: "Ines", text: "Can't see ten metres." },
          { speaker: "Bram", text: "Neither can they. Use it. And watch the wind; it pushes you sideways." },
        ],
      },
    ],
    storm_ambush: [
      { type: "spawn", wave: "storm2" },
      { type: "music", mood: "combat" },
      { type: "dialogue", lines: [{ speaker: "Gilt Radio", text: "Heavy unit in position. Nobody leaves those ruins." }] },
    ],
    "waveClear:storm1": [{ type: "spawn", wave: "storm2" }],
    "arenaClear:storm": [
      { type: "weather", id: "storm", active: false },
      { type: "music", mood: "explore" },
      { type: "objective", text: "Climb the waystation tower", target: { x: -2, y: 10, z: 792 } },
      { type: "dialogue", lines: [{ speaker: "Bram", text: "Storm's blowing itself out. That tower: Catalina's waystation, if your page is right." }] },
    ],
    "tut:tower": [{ type: "tutorial", text: "Climb the handholds: hold up on the stick and press Jump to reach for the next one.", action: "jump" }],
    inscription: [
      { type: "journal", id: "suns" },
      { type: "dialogue", lines: [{ speaker: "Ines", text: "'Greet the sun as it rises, stands, and sleeps.' East, then middle, then west." }] },
      { type: "objective", text: "Pull the levers in the order of the sun", target: { x: 0, y: 10, z: 806 } },
    ],
    lever: [],
    levers_solved: [
      { type: "reveal", group: "wsbridge" },
      { type: "shake", amount: 0.6 },
      { type: "music", mood: "wonder" },
      { type: "objective", text: "Cross to the cliff shrine", target: { x: 0, y: 10, z: 846 } },
    ],
    shrine: [
      { type: "journal", id: "chart" },
      {
        type: "cutscene",
        shots: [{ from: { x: 0, y: 12, z: 842 }, to: { x: 0, y: 11.5, z: 848 }, target: { x: 0, y: 10.5, z: 856 }, duration: 5 }],
        lines: [
          { speaker: "Ines", text: "Half a star chart. Torn clean in two, on purpose." },
          { speaker: "Bram", text: "And the other half?" },
          { speaker: "Ines", text: "A monastery in the mountains. Saint Aurel. There's a bell in the margin." },
        ],
      },
      { type: "emit", event: "end", delay: 5.5 },
    ],
    end: [{ type: "complete" }],
  },
  puzzles: [
    {
      id: "suns",
      type: "sequence",
      levers: ["lv_dawn", "lv_noon", "lv_dusk"],
      order: ["lv_dawn", "lv_noon", "lv_dusk"],
      onSolve: "levers_solved",
      hint: "The sun rises in the east, stands overhead, and sets in the west: east lever, middle lever, west lever.",
    },
  ],
  journal: [
    {
      id: "suns",
      title: "The Sun Inscription",
      text: "Carved above the levers: 'Greet the sun as it rises, stands, and sleeps.' Three levers face east, overhead and west.",
      sketch: [[10, 70, 90, 70], [20, 70, 30, 55], [50, 70, 50, 30], [80, 70, 70, 55]],
    },
    {
      id: "chart",
      title: "Half a Star Chart",
      text: "Catalina tore her chart in two. This half shows the southern stars. The margin has a sketch of a bell tower and the name Saint Aurel.",
      sketch: [[20, 20, 80, 20], [80, 20, 80, 80], [80, 80, 20, 80], [50, 20, 50, 80], [30, 35, 32, 37], [65, 50, 67, 52]],
    },
  ],
};
