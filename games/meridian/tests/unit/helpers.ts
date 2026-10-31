import { emptyFrame, type ButtonAction, type InputFrame } from "../../src/input/actions";
import { LevelBuilder } from "../../src/sim/world/LevelBuilder";
import type { ChapterDef } from "../../src/sim/story/types";
import { GameSim, defaultGameplay, type GameplayOptions } from "../../src/sim/GameSim";
import { World } from "../../src/sim/world/World";
import { PlayerController } from "../../src/sim/player/PlayerController";

export const DT = 1 / 60;

export function frame(opts: { move?: [number, number]; held?: ButtonAction[]; pressed?: ButtonAction[]; released?: ButtonAction[] } = {}): InputFrame {
  const f = emptyFrame();
  if (opts.move) f.move = { x: opts.move[0], y: opts.move[1] };
  for (const a of opts.held ?? []) f.buttons[a].held = true;
  for (const a of opts.pressed ?? []) {
    f.buttons[a].pressed = true;
    f.buttons[a].held = true;
  }
  for (const a of opts.released ?? []) f.buttons[a].released = true;
  return f;
}

/** A flat test yard with a wall + ledge, a rope, a zipline, cover and a pillar. */
export function testLevel() {
  const b = new LevelBuilder("test", { top: "#000", bottom: "#000", fog: "#000", fogDensity: 0 });
  b.box([-30, -1, -30], [30, 0, 30], "ground");
  // Wall at z = 10..12, 2.6 m tall, ledge on its south (-Z) face.
  b.box([-5, 0, 10], [5, 2.6, 12], "rock", { ledges: ["s"] });
  // Low cover.
  b.cover(-10, 0, 3, 0.8, 0, "low");
  // Rope over a pit area.
  b.rope([15, 8, 0], 5);
  b.zipline([-20, 6, -20], [-20, 2.6, 0]);
  b.box([-21, 0, -22], [-19, 4, -20], "rock");
  b.checkpoint("start", [0, 0, 0], 0, "Start");
  return b.build();
}

export function testChapter(build = testLevel): ChapterDef {
  return {
    id: "test",
    number: 0,
    title: "Test",
    location: "Test yard",
    synopsis: "",
    estMinutes: 1,
    playable: true,
    build,
    script: {
      startLoadout: { sidearm: "pistol", long: "rifle", grenades: 1, bottles: 1 },
      onStart: [],
      events: {},
      puzzles: [],
      journal: [],
      parTimeMinutes: 5,
    },
  };
}

export function newSim(opts: Partial<GameplayOptions> = {}, build = testLevel) {
  return new GameSim(testChapter(build), { ...defaultGameplay(), ...opts });
}

export function player(at: [number, number, number], yaw = 0, level = testLevel()) {
  const world = new World(level);
  const p = new PlayerController({ x: at[0], y: at[1], z: at[2] }, yaw);
  return { world, p };
}

export function run(p: PlayerController, world: World, frames: number, f: InputFrame | ((i: number) => InputFrame), camYaw = 0) {
  for (let i = 0; i < frames; i++) p.update(DT, typeof f === "function" ? f(i) : f, camYaw, world, false, { autoTraversal: false, holdToToggle: false });
}
