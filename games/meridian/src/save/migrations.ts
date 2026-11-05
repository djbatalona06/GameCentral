// Upgrades older save files one version at a time: v1 -> v2 -> ... -> current.

import { SAVE_VERSION, type SaveFile, type SaveFileV1, type SaveFileV2 } from "./schema";
import { newStoryState } from "../sim/story/State";

type AnySave = { version: number } & Record<string, unknown>;

const steps: Record<number, (s: AnySave) => AnySave> = {
  // v1 stored a flat chapter/checkpoint and a single treasure list.
  1: (raw) => {
    const s = raw as unknown as SaveFileV1;
    const at = new Date(s.savedAt || Date.now()).toISOString();
    const v2: SaveFileV2 = {
      version: 2,
      slot: s.slot,
      createdAt: at,
      updatedAt: at,
      playtimeSec: s.time ?? 0,
      difficulty: 1,
      currentChapter: s.chapter ?? "ch01",
      snapshot: null,
      chapters: {
        [s.chapter ?? "ch01"]: { completed: false, treasures: [...(s.treasures ?? [])], medals: [] },
      },
      journal: [],
      unlocks: [],
      newGamePlus: false,
    };
    return v2 as unknown as AnySave;
  },
  // v2 had no story state: start everyone at the usual starting feelings. Choices already made
  // cannot be recovered, so a finished chapter simply keeps the neutral story.
  2: (raw) => {
    const v3: SaveFile = { ...(raw as unknown as SaveFileV2), version: 3, story: newStoryState() };
    return v3 as unknown as AnySave;
  },
};

export function migrate(raw: unknown): SaveFile {
  if (!raw || typeof raw !== "object" || typeof (raw as AnySave).version !== "number") {
    throw new Error("Not a Meridian save file");
  }
  let s = raw as AnySave;
  if (s.version > SAVE_VERSION) throw new Error(`Save is from a newer version (${s.version})`);
  while (s.version < SAVE_VERSION) {
    const step = steps[s.version];
    if (!step) throw new Error(`No migration from save version ${s.version}`);
    s = step(s);
  }
  return s as unknown as SaveFile;
}
