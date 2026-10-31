// Three manual save slots plus an autosave. Checkpoints write to the active slot automatically.

import { migrate } from "./migrations";
import { AUTOSAVE_SLOT, SLOT_COUNT, type SaveFile, isSaveFile } from "./schema";
import type { KeyValueStore } from "./storage";

const key = (slot: number) => `save:${slot}`;

export class SaveManager {
  constructor(private store: KeyValueStore) {}

  async load(slot: number): Promise<SaveFile | null> {
    const raw = await this.store.get<unknown>(key(slot));
    if (!raw) return null;
    const save = migrate(raw);
    // Write back upgraded saves so migration only happens once.
    if ((raw as { version: number }).version !== save.version) await this.store.set(key(slot), save);
    return save;
  }

  async save(file: SaveFile): Promise<void> {
    file.updatedAt = new Date().toISOString();
    await this.store.set(key(file.slot), file);
  }

  async delete(slot: number): Promise<void> {
    await this.store.delete(key(slot));
  }

  /** Summaries for the slot picker: manual slots in order, then autosave. */
  async list(): Promise<Array<{ slot: number; save: SaveFile | null }>> {
    const slots = [...Array.from({ length: SLOT_COUNT }, (_, i) => i), AUTOSAVE_SLOT];
    const out: Array<{ slot: number; save: SaveFile | null }> = [];
    for (const slot of slots) {
      try {
        out.push({ slot, save: await this.load(slot) });
      } catch {
        out.push({ slot, save: null });
      }
    }
    return out;
  }

  /** Most recently updated save (for the Continue button). */
  async latest(): Promise<SaveFile | null> {
    const all = (await this.list()).map((x) => x.save).filter((s): s is SaveFile => !!s);
    all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return all[0] ?? null;
  }

  exportJson(save: SaveFile): string {
    return JSON.stringify(save, null, 2);
  }

  /** Imports a save from JSON text into a slot. Throws a friendly error if the file is wrong. */
  async importJson(text: string, slot: number): Promise<SaveFile> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("That file isn't valid JSON.");
    }
    const save = migrate(parsed);
    if (!isSaveFile(save)) throw new Error("That file isn't a Meridian save.");
    save.slot = slot;
    await this.save(save);
    return save;
  }
}
