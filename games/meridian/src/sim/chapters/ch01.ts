// Chapter 1 — Breakwater
// A reef shipwreck and sea cliffs. Teaches movement, climbing, swimming, ropes, beams,
// stealth and cover combat, then ends with a zipline ride down to Bram's boat.

import { LevelBuilder } from "../world/LevelBuilder";
import type { ChapterScript } from "../story/types";

export function buildCh01() {
  const b = new LevelBuilder("ch01", { top: "#7fb7d9", bottom: "#e8d9b5", fog: "#cfe3ee", fogDensity: 0.006 });

  // --- 1. Beach ---------------------------------------------------------------------------
  b.box([-10, -8, -16], [10, 26, -12], "rock"); // back wall
  b.walls(8, -14, 40);
  b.box([-10, -8, 40], [-8, 26, 100], "rock"); // west cliff
  b.box([8, -8, 82], [10, 26, 100], "rock"); // east cliff beyond the shelf
  b.box([-8, -1, -12], [8, 0, 18], "sand");
  b.block(3, 4, 2, 2, 0, 0.35, "rock"); // step
  b.block(-3, 9, 3, 2.5, 0, 1.0, "rock"); // jump-up rock
  b.treasure("ch01-reale", [-3, 1.4, 9], "Silver Reale", "A sea-worn coin minted in 1571. The edge is clipped, the way sailors paid their debts.");
  b.box([-8, 0, 18], [8, 2.6, 21], "rock", { ledges: ["s"] }); // first climb
  b.trigger([-8, 0, 12], [8, 3, 17], "tut:climb");
  b.checkpoint("c1", [0, 0, -6], 0, "Breakwater Beach");

  // --- 2. Lagoon -------------------------------------------------------------------------
  b.ramp([-8, 0, 21], [8, 2.6, 27], "z", -1, "sand");
  b.box([-8, -1.5, 27], [8, -0.5, 33], "sand");
  b.box([-8, -5, 33], [8, -3, 51], "sand");
  b.water([-8, -5, 26], [8, 0, 51.5]);
  b.trigger([-8, -5, 33], [8, 0, 36], "tut:swim");

  // --- 3. Shipwreck ----------------------------------------------------------------------
  b.box([-4, -3, 51], [4, 3, 63], "wood", { ledges: ["s"] });
  b.handholds("z", 51, -1, 0, 0, [0.7, 1.9], 1.6);
  b.block(0, 60, 4, 3, 3, 5.2, "wood"); // cabin
  b.interact("astrolabe", [0, 4.1, 58.2], "examine", "Examine the astrolabe", "astrolabe");
  b.treasure("ch01-compass", [3, 3.4, 54], "Brass Sailor's Compass", "Its needle still swings true. Someone scratched the initials C.O. into the lid.");
  b.checkpoint("c2", [0, 3, 55], 0, "The Wreck of the Santa Brigida");
  b.box([-4, -8, 63], [4, -3, 64], "rock"); // seabed lip under the stern

  // --- 4. Shore shelf --------------------------------------------------------------------
  b.box([-8, -1, 63], [8, 1, 82], "rock");
  b.box([8, -8, 40], [10, 4.5, 82], "rock"); // lower east wall so the sea is visible
  b.box([24, 0, 64], [30, 3, 74], "metal", { group: "giltboat", hidden: true });
  b.trigger([-8, 1, 74], [8, 4, 81], "tut:handholds");
  b.checkpoint("c3", [0, 1, 70], 0, "Rocky Shelf");

  // --- 5. Sea cliff ----------------------------------------------------------------------
  b.box([-8, 1, 82], [8, 12, 100], "rock", { ledges: ["s"] });
  b.handholds("z", 82, -1, -5, -1, [3.4, 5.2, 7.0, 8.8, 10.4], 1.2, [2]);
  b.treasure("ch01-spyglass", [7, 12.4, 97], "Cracked Spyglass", "Ivory casing, Portuguese make. The lens is gone but the maker's mark survives.");
  b.checkpoint("c4", [0, 12, 92], 0, "Cliff Top");

  // --- 6. Rope chasm ---------------------------------------------------------------------
  b.rope([0, 17.5, 104.2], 6);
  b.trigger([-8, 12, 95], [8, 15, 100], "tut:rope");

  // --- 7. Beam ---------------------------------------------------------------------------
  b.box([-8, 1, 108.5], [8, 12, 125], "rock", { ledges: ["s"] });
  b.walls(8, 100, 133);
  b.beam([0, 12, 125], [0, 12, 133]);
  b.trigger([-8, 12, 120], [8, 15, 125], "tut:beam");
  b.checkpoint("c5", [0, 12, 115], 0, "Windward Ridge");

  // --- 8. Watchtower ruins (stealth / combat) -------------------------------------------
  b.box([-14, 1, 133], [14, 12, 178], "stone");
  b.walls(14, 133, 178);
  b.checkpoint("c6", [0, 12, 136.5], 0, "Watchtower Approach");
  b.trigger([-14, 12, 137.5], [14, 15, 140], "arena_enter");
  b.cover(-4, 143, 3, 0.8, 12, "low");
  b.cover(5, 146, 0.8, 3, 12, "high");
  b.cover(-8, 152, 3, 0.8, 12, "low");
  b.cover(3, 155, 3, 0.8, 12, "low", "wood", 60);
  b.cover(9, 160, 0.8, 3, 12, "high");
  b.cover(-3, 163, 3, 0.8, 12, "low");
  b.cover(-10, 166, 0.8, 3, 12, "high");
  b.barrel(6, 150.5, 12);
  b.barrel(-6, 160.5, 12);
  b.grass([-13.5, 12, 140], [-9, 13.2, 151]);
  b.grass([9.5, 12, 150], [13.5, 13.2, 163]);
  b.block(0, 168.9, 2, 0.6, 12, 12.4, "stone");
  b.block(0, 169.5, 2, 0.6, 12, 12.8, "stone");
  b.block(0, 172, 6, 4, 12, 13.2, "stone"); // tower platform
  b.arena("tower", [-14, 11, 133], [14, 16, 178]);
  b.enemy("rifleman", [-2, 12, 150], 180, "tower", { patrol: [[-2, 12, 150], [7, 12, 150], [7, 12, 141], [-2, 12, 141]] });
  b.enemy("rifleman", [8, 12, 166], 200, "tower");
  b.enemy("rifleman", [-9, 12, 158], 160, "tower", { patrol: [[-9, 12, 158], [-9, 12, 146], [0, 12, 158]] });
  b.enemy("shotgunner", [0, 12, 176], 180, "tower", { wave: "tower2", alerted: true });
  b.enemy("rifleman", [9, 12, 176], 180, "tower", { wave: "tower2", alerted: true });
  b.enemy("rifleman", [-9, 12, 176], 180, "tower", { wave: "tower2", alerted: true });
  b.pickup([-11.5, 12.4, 136], "weapon", 30, "rifle");
  b.pickup([0, 12.3, 148.5], "ammo", 20);
  b.pickup([11, 12.3, 140], "grenade", 1);
  b.pickup([-6, 12.3, 166], "ammo", 20);
  b.pickup([12, 12.3, 145], "bottle", 1);
  b.treasure("ch01-tag", [-12.5, 12.4, 171], "Gilt Company Tag", "Stamped steel: a crowned anchor over the motto PAID IN FULL.");
  b.zipline([0, 15.6, 173.2], [0, 3.6, 212]);

  // --- 9. Cove ---------------------------------------------------------------------------
  b.box([-8, -1, 195], [8, 1.5, 236], "sand");
  b.walls(8, 190, 238);
  b.box([-10, -8, 236], [10, 26, 240], "rock");
  b.block(0, 229, 3, 6, 1.5, 2.6, "wood"); // Bram's boat
  b.trigger([-8, 1.5, 222], [8, 4, 226], "reach_boat");
  b.treasure("ch01-seal", [6, 1.9, 215], "Ordaz Family Seal", "A wax seal stamp: a compass rose wrapped in a serpent. The serpent bites a star.");
  b.checkpoint("c7", [0, 1.5, 205], 0, "Smuggler's Cove");

  return b.build();
}

export const ch01Script: ChapterScript = {
  parTimeMinutes: 22,
  startLoadout: { sidearm: "pistol", long: null, sidearmAmmo: 45, grenades: 0, bottles: 0 },
  onStart: [
    { type: "music", mood: "explore" },
    { type: "objective", text: "Reach the shipwreck", target: { x: 0, y: 3, z: 57 } },
    {
      type: "dialogue",
      lines: [
        { speaker: "Bram", text: "Ines, you reading me? The tide gives us an hour, maybe less." },
        { speaker: "Ines", text: "Loud and clear. If the Santa Brigida's out there, I'll find her." },
        { speaker: "Bram", text: "Catalina's ship has been lost for four hundred years. Try not to join her." },
      ],
    },
    { type: "tutorial", text: "Move with the left stick. Swipe the right side of the screen to look around." },
  ],
  events: {
    "tut:climb": [
      { type: "tutorial", text: "Jump toward the rock face to grab its edge, then jump again to climb up.", action: "jump" },
    ],
    "tut:swim": [
      { type: "tutorial", text: "Swim to the wreck. Press Jump next to a handhold to pull yourself out of the water.", action: "jump" },
      { type: "dialogue", lines: [{ speaker: "Ines", text: "Water's warmer than you promised." }, { speaker: "Bram", text: "I promised nothing. That's my whole business model." }] },
    ],
    astrolabe: [
      { type: "journal", id: "astrolabe" },
      { type: "reveal", group: "giltboat" },
      {
        type: "cutscene",
        shots: [
          { from: { x: 2, y: 5.5, z: 55 }, to: { x: 1, y: 5, z: 56.5 }, target: { x: 0, y: 4.1, z: 58.2 }, duration: 3.5 },
          { from: { x: 6, y: 7, z: 60 }, to: { x: 7, y: 6, z: 64 }, target: { x: 27, y: 2, z: 69 }, duration: 4.5 },
        ],
        lines: [
          { speaker: "Ines", text: "An astrolabe... and there's a meridian line etched across it. That's not standard." },
          { speaker: "Bram", text: "Ines. Boat on your east. Gold paint on the hull." },
          { speaker: "Varek", text: "Miss Calder. Thank you for finding it. My Gilt Company will take it from here." },
        ],
      },
      { type: "music", mood: "tension" },
      { type: "objective", text: "Climb the sea cliff before the Gilt Company lands", target: { x: -5, y: 3.4, z: 81.6 } },
    ],
    "tut:handholds": [
      { type: "tutorial", text: "Pale-edged handholds can be climbed. Hold the stick in a direction and press Jump to leap to the next one.", action: "jump" },
      { type: "dialogue", lines: [{ speaker: "Bram", text: "Careful on that cliff. The rock up there crumbles if you hang around." }] },
    ],
    "tut:rope": [
      { type: "tutorial", text: "Run and jump to catch the rope. Push forward to swing, then press Jump to let go.", action: "jump" },
    ],
    "tut:beam": [
      { type: "tutorial", text: "Narrow beam: walk slowly and push sideways against the sway to keep your balance." },
    ],
    arena_enter: [
      { type: "stealth", active: true },
      { type: "objective", text: "Get past the Gilt patrol at the watchtower", target: { x: 0, y: 13.2, z: 172 } },
      { type: "dialogue", lines: [{ speaker: "Ines", text: "Three of them. I'd rather they didn't know I'm here." }] },
      { type: "tutorial", text: "Crouch in tall grass to hide. Sneak up behind a guard and press Melee for a silent takedown.", action: "melee" },
    ],
    "waveClear:tower": [
      { type: "stealth", active: false },
      { type: "spawn", wave: "tower2" },
      { type: "music", mood: "combat" },
      { type: "dialogue", lines: [{ speaker: "Gilt Radio", text: "Patrol isn't answering. Squad two, sweep the tower!" }, { speaker: "Ines", text: "Here they come." }] },
      { type: "tutorial", text: "Press Cover near a wall to take cover. Aim to pop out and shoot; fire without aiming to blind-fire.", action: "coverRoll" },
    ],
    "waveClear:tower2": [
      { type: "music", mood: "explore" },
      { type: "objective", text: "Ride the zipline down to the cove", target: { x: 0, y: 13.2, z: 172 } },
      { type: "dialogue", lines: [{ speaker: "Bram", text: "I see a cable running down to the cove. I'll meet you there." }] },
      { type: "tutorial", text: "Stand on the tower platform and press Interact to ride the zipline.", action: "interact" },
    ],
    reach_boat: [
      { type: "dialogue", lines: [
        { speaker: "Bram", text: "Get in, get in! Did you at least get a look at the thing?" },
        { speaker: "Ines", text: "Better. I got a rubbing of the meridian line. It points east, to Qasr Amal." },
        { speaker: "Bram", text: "Then Varek will be heading there too." },
      ] },
      { type: "emit", event: "end", delay: 6 },
    ],
    end: [{ type: "complete" }],
  },
  puzzles: [],
  journal: [
    {
      id: "astrolabe",
      title: "Catalina's Astrolabe",
      text: "Bronze, Spanish, late 1500s. A line has been cut across the rete that doesn't match any star. Catalina de Ordaz marked her own meridian, a private north. The rubbing points toward the old port of Qasr Amal.",
      sketch: [[50, 10, 50, 90], [10, 50, 90, 50], [20, 20, 80, 80], [50, 50, 78, 30], [30, 70, 70, 70]],
    },
  ],
};
