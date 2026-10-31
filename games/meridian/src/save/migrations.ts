// Upgrades older save files one version at a time: v1 -> v2 -> ... -> current.

import { SAVE_VERSION, type SaveFile, type SaveFileV1 } from "./schema";

type AnySave = { version: number } & Record<string, unknown>;

const steps: Record<number, (s: AnySave) => AnySave> = {
  // v1 stored a flat chapter/checkpoint and a single treasure list.
  1: (raw) => {
    const s = raw as unknown as SaveFileV1;
    const at = new Date(s.savedAt || Date.now()).toISOString();
    const v2: SaveFile = {
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
