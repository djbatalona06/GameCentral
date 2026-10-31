// Puzzle rules as small pure functions so they're easy to test and to reset on checkpoint restore.

import type { PuzzleDef } from "./types";

export interface PuzzleState {
  def: PuzzleDef;
  solved: boolean;
  failures: number;
  /** Seconds since the player first touched the puzzle (drives hints and the skip option). */
  elapsed: number;
  started: boolean;
  pillars: number[];
  progress: number;
  platesDown: boolean[];
}

export const newPuzzle = (def: PuzzleDef): PuzzleState => ({
  def,
  solved: false,
  failures: 0,
  elapsed: 0,
  started: false,
  pillars: def.type === "pillars" ? [...def.initial] : [],
  progress: 0,
  platesDown: def.type === "plates" ? def.plates.map(() => false) : [],
});

/** Rotates a pillar a quarter turn. Returns true if this solved the puzzle. */
export function rotatePillar(p: PuzzleState, pillarId: string): boolean {
  if (p.def.type !== "pillars" || p.solved) return false;
  const i = p.def.pillars.indexOf(pillarId);
  if (i < 0) return false;
  p.started = true;
  p.pillars[i] = (p.pillars[i] + 1) % 4;
  const solved = p.pillars.every((v, k) => v === (p.def as { solution: number[] }).solution[k]);
  // A full wasted rotation of any pillar counts as a failure for the skip option.
  if (!solved && p.pillars[i] === p.def.initial[i]) p.failures++;
  p.solved = solved;
  return solved;
}

/** Pulls a lever in an ordered sequence. Wrong lever resets progress. Returns true when solved. */
export function pullLever(p: PuzzleState, leverId: string): { solved: boolean; wrong: boolean } {
  if (p.def.type !== "sequence" || p.solved) return { solved: false, wrong: false };
  p.started = true;
  if (p.def.order[p.progress] === leverId) {
    p.progress++;
    if (p.progress >= p.def.order.length) {
      p.solved = true;
      return { solved: true, wrong: false };
    }
    return { solved: false, wrong: false };
  }
  p.progress = 0;
  p.failures++;
  return { solved: false, wrong: true };
}

/** Rings a bell. A wrong note resets the tune. Returns which bell rang and whether that solved it. */
export function ringBell(p: PuzzleState, bellId: string): { index: number; solved: boolean; wrong: boolean } {
  if (p.def.type !== "bells") return { index: -1, solved: false, wrong: false };
  const index = p.def.bells.indexOf(bellId);
  if (index < 0 || p.solved) return { index, solved: false, wrong: false };
  p.started = true;
  if (p.def.order[p.progress] === index) {
    p.progress++;
    if (p.progress >= p.def.order.length) {
      p.solved = true;
      return { index, solved: true, wrong: false };
    }
    return { index, solved: false, wrong: false };
  }
  // A wrong note might still be the first note of a fresh attempt.
  p.failures++;
  p.progress = p.def.order[0] === index ? 1 : 0;
  return { index, solved: false, wrong: true };
}

/** Human-readable name for a bell, used in on-screen captions so the puzzle works without sound. */
export const BELL_NAMES = ["lowest", "low", "middle", "high", "highest"];
export const bellCaption = (index: number, count: number): string => {
  const names = count <= 3 ? ["low", "middle", "high"] : BELL_NAMES;
  return `Bell ${index + 1} (${names[Math.min(index, names.length - 1)]})`;
};

/** Updates pressure plates from a weight test. Returns true once every plate is held down together. */
export function updatePlates(p: PuzzleState, pressed: (plate: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }) => boolean): boolean {
  if (p.def.type !== "plates" || p.solved) return false;
  p.platesDown = p.def.plates.map(pressed);
  if (p.platesDown.some(Boolean)) p.started = true;
  if (p.platesDown.every(Boolean)) {
    p.solved = true;
    return true;
  }
  return false;
}

/** The assist option lets players skip a puzzle after enough failures or time. */
export function canSkip(p: PuzzleState, failuresNeeded: number, secondsNeeded = 180): boolean {
  return !p.solved && p.started && (p.failures >= failuresNeeded || p.elapsed >= secondsNeeded);
}

export const showHint = (p: PuzzleState): boolean => !p.solved && p.started && (p.elapsed > 60 || p.failures >= 2);
