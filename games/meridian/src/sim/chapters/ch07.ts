// Chapter 7 — Ironwood Docks (end of Act I)
// Sneak through a container yard lit by sweeping searchlights (sabotage their power panels),
// restart the gate's fuses in the right order, cross the harbour on containers hanging from
// cranes, then fight across the deck of Varek's ship to learn what he is really planning.

import { LevelBuilder } from "../world/LevelBuilder";
import type { ChapterScript } from "../story/types";

export function buildCh07() {
  const b = new LevelBuilder("ch07", { top: "#141a26", bottom: "#36404f", fog: "#222a36", fogDensity: 0.012 }, -20);

  // --- 1. Container yard (searchlights) ---------------------------------------------------
  b.box([-22, -1, -16], [22, 0, 84], "metal", { ledges: ["n"] });
  b.box([-22, -8, -20], [22, 26, -16], "rock");
  b.walls(20, -16, 84);
  b.checkpoint("c1", [0, 0, -8], 0, "Ironwood Yard");
  b.trigger([-20, 0, 4], [20, 3, 7], "tut:searchlight");
  // Container stacks: high cover you can also climb on top of.
  for (const [x, z] of [[-6, 14], [7, 22], [-9, 40], [3, 48], [9, 34], [-4, 62], [8, 68]]) {
    b.block(x, z, 6, 2.6, 0, 2.6, "metal", { cover: "high", ledges: ["s", "n"] });
  }
  b.cover(-12, 24, 2.4, 0.9, 0, "low", "wood");
  b.cover(13, 46, 2.4, 0.9, 0, "low", "wood");
  b.cover(-13, 54, 2.4, 0.9, 0, "low", "wood");
  // Searchlight towers and their power panels.
  b.box([-17, 0, 28], [-15, 8, 32], "metal");
  b.searchlight("sl1", [-14, 8.5, 30], 90, 50, 7, "yard", 30);
  b.interact("panel1", [-14.4, 1.2, 33.2], "panel", "Cut the searchlight's power", "panel1");
  b.box([15, 0, 58], [17, 8, 62], "metal");
  b.searchlight("sl2", [14, 8.5, 60], 270, 50, 6, "yard", 30);
  b.interact("panel2", [14.4, 1.2, 63.2], "panel", "Cut the searchlight's power", "panel2");
  b.pickup([-18, 0.3, 4], "bottle", 2);
  b.pickup([18, 0.3, 40], "ammo", 20);
  b.treasure("ch07-compass", [-9, 3.0, 40], "Shipwright's Compass", "A dry compass in a teak box. The needle points steadily at the harbour, not north.");
  b.arena("yard", [-20, -1, -14], [20, 6, 78]);
  b.enemy("rifleman", [-2, 0, 20], 90, "yard", { patrol: [[-2, 0, 20], [12, 0, 28], [-2, 0, 30]] });
  b.enemy("rifleman", [0, 0, 42], 270, "yard", { patrol: [[0, 0, 42], [-14, 0, 48], [0, 0, 54]] });
  b.enemy("rifleman", [12, 0, 52], 180, "yard", { patrol: [[12, 0, 52], [12, 0, 40]] });
  b.enemy("shotgunner", [-8, 0, 72], 180, "yard");
  b.enemy("heavy", [3, 0, 74], 180, "yard");

  // Gate and gatehouse fuse box.
  b.box([-20, 0, 78], [-3, 6, 80], "metal");
  b.box([3, 0, 78], [20, 6, 80], "metal");
  b.box([-3, 0, 78], [3, 5, 80], "metal", { group: "yardgate" });
  b.block(12, 74, 3, 3, 0, 3, "plaster");
  b.interact("diagram", [12, 1.4, 72.2], "examine", "Read the wiring diagram", "diagram", { once: false, radius: 1.2 });
  b.interact("fuse_r", [10.2, 1.2, 73], "lever", "Reset the red fuse", "fuse", { once: false, radius: 0.9 });
  b.interact("fuse_b", [10.2, 1.2, 74], "lever", "Reset the blue fuse", "fuse", { once: false, radius: 0.9 });
  b.interact("fuse_y", [10.2, 1.2, 75], "lever", "Reset the yellow fuse", "fuse", { once: false, radius: 0.9 });
  b.treasure("ch07-tag", [14.2, 0.4, 76.5], "Brass Dog Tag", "Stamped 'B. OKAFOR, MV SALT HARE'. Bram never mentioned working these docks.");

  // --- 2. Harbour crossing on crane containers --------------------------------------------
  b.walls(20, 84, 192);
  b.checkpoint("c2", [0, 0, 82], 0, "Harbour Edge");
  b.water([-20, -8, 84], [20, -0.5, 108]);
  b.box([-22, -9, 84], [22, -8, 108], "rock");
  b.trigger([-20, 0, 80.5], [20, 3, 83], "tut:cranes");
  b.box([-1.5, -2, 85.5], [1.5, 0.6, 91.5], "metal", { group: "ct1", ledges: ["s"] });
  b.mover("crane1", "ct1", [[-5, 0, 0], [5, 0, 0]], 2, { pause: 1.2 });
  b.box([-1.5, -2, 93], [1.5, 0.6, 99], "metal", { group: "ct2", ledges: ["s"] });
  b.box([-1.5, -2, 100.5], [1.5, 0.6, 106.5], "metal", { group: "ct3", ledges: ["s"] });
  b.mover("crane3", "ct3", [[0, 0, 0], [0, 2.5, 0]], 1.2, { pause: 2 });
  b.box([-20, -8, 108], [20, 3.1, 124], "stone", { ledges: ["s"] });
  b.checkpoint("c3", [0, 3.1, 111], 0, "Far Quay");
  b.treasure("ch07-rivet", [16, 3.5, 118], "Gold Rivet", "From the Gilded Tide's hull. Varek had his ship riveted in gold. Of course he did.");

  // --- 3. The Gilded Tide -----------------------------------------------------------------
  b.ramp([-1.5, 3.1, 116], [1.5, 6, 124], "z", 1, "wood");
  b.box([-10, -8, 124], [10, 6, 192], "metal");
  b.checkpoint("c4", [0, 6, 127], 0, "Gangway");
  b.trigger([-10, 6, 128], [10, 9, 130], "deck");
  b.cover(-5, 136, 3, 0.9, 6, "low", "wood", 60);
  b.cover(4, 140, 0.9, 3, 6, "high", "metal");
  b.cover(-7, 148, 0.9, 3, 6, "high", "metal");
  b.cover(1, 152, 3, 0.9, 6, "low", "metal");
  b.cover(7, 158, 3, 0.9, 6, "low", "wood", 60);
  b.cover(-3, 164, 3, 0.9, 6, "low", "metal");
  b.barrel(-1, 145, 6);
  b.barrel(6, 166, 6);
  b.pickup([-9, 6.3, 130], "weapon", 30, "rifle");
  b.pickup([9, 6.3, 130], "grenade", 2);
  b.pickup([0, 6.3, 156], "ammo", 30);
  b.treasure("ch07-bell", [8.5, 6.4, 150], "Ship's Bell", "Cast with the name of a ship that sank in 1612. Varek salvages more than gold.");
  b.arena("deck", [-10, 5, 124], [10, 10, 176]);
  b.enemy("rifleman", [-4, 6, 158], 180, "deck");
  b.enemy("rifleman", [5, 6, 162], 180, "deck");
  b.enemy("grenadier", [-7, 6, 170], 180, "deck");
  b.enemy("heavy", [0, 6, 172], 180, "deck", { wave: "deck2", alerted: true });
  b.enemy("shotgunner", [-6, 6, 174], 180, "deck", { wave: "deck2", alerted: true });
  b.enemy("shotgunner", [6, 6, 174], 180, "deck", { wave: "deck2", alerted: true });
  b.arena("bridge", [-6, 9.9, 176], [6, 13, 190]);
  b.enemy("sniper", [0, 10.5, 184], 180, "bridge");

  // Wheelhouse.
  b.box([-6, 6, 176], [6, 10.5, 190], "plaster");
  b.checkpoint("c5", [0, 6, 171], 0, "Wheelhouse");
  b.interact("manifest", [0, 7, 174.5], "examine", "Read Varek's manifest", "manifest", { radius: 1.6, hidden: true });
  b.treasure("ch07-key", [4.5, 6.4, 175], "Brass Chart-Room Key", "Heavy, warm and stamped with the Gilt Company's crown. It opens a room on a ship you haven't seen yet.");

  return b.build();
}

export const ch07Script: ChapterScript = {
  parTimeMinutes: 30,
  startLoadout: { sidearm: "pistol", long: "rifle", sidearmAmmo: 30, longAmmo: 60, grenades: 1, bottles: 1 },
  onStart: [
    { type: "music", mood: "tension" },
    { type: "stealth", active: true },
    { type: "objective", text: "Cross the container yard to the harbour gate", target: { x: 0, y: 0, z: 76 } },
    {
      type: "dialogue",
      lines: [
        { speaker: "Bram", text: "Ironwood Docks. Varek's ship is the one with the gold paint." },
        { speaker: "Ines", text: "Two searchlights on the yard. Guards on the gate." },
        { speaker: "Bram", text: "Lights run on power panels at the base of each tower. Cut them and you're a ghost." },
      ],
    },
  ],
  events: {
    "tut:searchlight": [{ type: "tutorial", text: "Stay out of the searchlight beams. If the meter fills, the whole yard is alerted. Cut the power at each tower's panel.", action: "interact" }],
    panel1: [
      { type: "searchlight", id: "sl1", active: false },
      { type: "dialogue", lines: [{ speaker: "Ines", text: "West light's out." }] },
    ],
    panel2: [
      { type: "searchlight", id: "sl2", active: false },
      { type: "dialogue", lines: [{ speaker: "Ines", text: "East light's out. Nobody's watching the yard now." }] },
    ],
    "searchlightAlarm:sl1": [
      { type: "music", mood: "combat" },
      { type: "dialogue", lines: [{ speaker: "Gilt Radio", text: "Contact in the yard, west side! All units!" }] },
    ],
    "searchlightAlarm:sl2": [
      { type: "music", mood: "combat" },
      { type: "dialogue", lines: [{ speaker: "Gilt Radio", text: "Contact in the yard, east side! All units!" }] },
    ],
    "arenaClear:yard": [{ type: "music", mood: "tension" }],
    diagram: [
      { type: "journal", id: "fuses" },
      { type: "objective", text: "Reset the gate fuses in the right order", target: { x: 10.2, y: 1, z: 74 } },
    ],
    fuse: [],
    gate_open: [
      { type: "remove", group: "yardgate" },
      { type: "stealth", active: false },
      { type: "music", mood: "explore" },
      { type: "objective", text: "Cross the harbour on the crane containers", target: { x: 0, y: 3.1, z: 110 } },
    ],
    "tut:cranes": [
      { type: "tutorial", text: "The containers hang from moving cranes. Wait for one to swing in front of you, then jump. Standing on one carries you along.", action: "jump" },
    ],
    deck: [
      { type: "music", mood: "combat" },
      { type: "objective", text: "Fight your way to the wheelhouse", target: { x: 0, y: 6, z: 172 } },
      { type: "dialogue", lines: [{ speaker: "Mercenary", text: "Boarder! On the gangway!" }] },
    ],
    "waveClear:deck": [
      { type: "spawn", wave: "deck2" },
      { type: "dialogue", lines: [{ speaker: "Gilt Radio", text: "Heavy team to the main deck. Protect the manifest." }] },
    ],
    "waveClear:deck2": [
      { type: "music", mood: "tension" },
      { type: "checkpoint", id: "c5" },
      { type: "revealInteract", id: "manifest" },
      { type: "objective", text: "Read Varek's manifest in the wheelhouse", target: { x: 0, y: 7, z: 174.5 } },
    ],
    manifest: [
      { type: "journal", id: "manifest" },
      {
        type: "cutscene",
        shots: [
          { from: { x: 2, y: 8.5, z: 170 }, to: { x: 0, y: 8, z: 172 }, target: { x: 0, y: 7, z: 175 }, duration: 5 },
          { from: { x: -8, y: 12, z: 160 }, to: { x: 8, y: 12, z: 160 }, target: { x: 0, y: 6, z: 180 }, duration: 6 },
        ],
        lines: [
          { speaker: "Ines", text: "Explosives. Dredging rigs. Pumps. Enough to drain a lagoon." },
          { speaker: "Varek", text: "Good evening, Ines. You read faster than my lawyers." },
          { speaker: "Varek", text: "Meridia isn't lost. It's underwater. I simply intend to take the water away." },
          { speaker: "Ines", text: "Drain it and the whole city collapses. Everything Catalina protected." },
          { speaker: "Varek", text: "Everything Catalina hid. There's a difference. See you at sea." },
        ],
      },
      { type: "emit", event: "end", delay: 11.5 },
    ],
    end: [{ type: "complete" }],
  },
  puzzles: [
    {
      id: "fuses",
      type: "sequence",
      levers: ["fuse_r", "fuse_b", "fuse_y"],
      order: ["fuse_b", "fuse_r", "fuse_y"],
      onSolve: "gate_open",
      hint: "The diagram says: blue first, then red, then yellow.",
    },
  ],
  journal: [
    {
      id: "fuses",
      title: "Gate Wiring Diagram",
      text: "Taped inside the fuse box: 'After a trip, restore BLUE (control), then RED (motor), then YELLOW (lights). Wrong order trips it again.'",
      sketch: [[20, 30, 80, 30], [20, 50, 80, 50], [20, 70, 80, 70], [50, 20, 50, 80]],
    },
    {
      id: "manifest",
      title: "Varek's Manifest",
      text: "Cargo for the Gilded Tide: 40 tonnes of explosive, six dredging pumps, two salvage cranes. Destination: open water at the coordinates on Catalina's chart. Varek means to drain the lagoon over Meridia.",
      sketch: [[20, 20, 80, 20], [20, 35, 70, 35], [20, 50, 75, 50], [20, 65, 60, 65], [20, 80, 80, 80]],
    },
  ],
};
