import { describe, expect, it } from "vitest";
import { SaveManager } from "../../src/save/SaveManager";
import { MemoryStore } from "../../src/save/storage";
import { migrate } from "../../src/save/migrations";
import { newSave, SAVE_VERSION, type SaveFileV1 } from "../../src/save/schema";
import { GameSim, defaultGameplay } from "../../src/sim/GameSim";
import { CHAPTERS } from "../../src/sim/chapters/registry";

describe("save system", () => {
  it("saves to a slot and loads it back", async () => {
    const m = new SaveManager(new MemoryStore());
    const s = newSave(1, 2);
    s.playtimeSec = 1234;
    await m.save(s);
    const back = await m.load(1);
    expect(back?.playtimeSec).toBe(1234);
    expect(back?.difficulty).toBe(2);
    expect(await m.load(0)).toBeNull();
  });

  it("migrates a version 1 save and writes the upgrade back", async () => {
    const store = new MemoryStore();
    const v1: SaveFileV1 = { version: 1, slot: 0, chapter: "ch02", checkpoint: "c3", time: 900, treasures: ["ch02-lamp"], savedAt: 1700000000000 };
    await store.set("save:0", v1);
    const m = new SaveManager(store);
    const s = await m.load(0);
    expect(s?.version).toBe(SAVE_VERSION);
    expect(s?.currentChapter).toBe("ch02");
    expect(s?.chapters.ch02.treasures).toEqual(["ch02-lamp"]);
    expect(((await store.get("save:0")) as { version: number }).version).toBe(SAVE_VERSION);
  });

  it("refuses saves from the future and junk", () => {
    expect(() => migrate({ version: 99 })).toThrow();
    expect(() => migrate("hello")).toThrow();
  });

  it("exports and imports JSON", async () => {
    const m = new SaveManager(new MemoryStore());
    const s = newSave(0, 1);
    s.journal = ["astrolabe"];
    const text = m.exportJson(s);
    const imported = await m.importJson(text, 2);
    expect(imported.slot).toBe(2);
    expect((await m.load(2))?.journal).toEqual(["astrolabe"]);
    await expect(m.importJson("{nope", 0)).rejects.toThrow();
  });

  it("restores a mid-chapter checkpoint snapshot exactly", () => {
    const ch = CHAPTERS[0];
    const a = new GameSim(ch, defaultGameplay());
    a.fireEvent("astrolabe");
    a.forceCheckpoint("c3");
    a.weapons.sidearm!.reserve = 7;
    const snap = JSON.parse(JSON.stringify(a.snapshot()));
    const b = new GameSim(ch, defaultGameplay(), snap);
    expect(b.checkpointId).toBe("c3");
    expect(b.player.pos.z).toBeCloseTo(70);
    expect(b.weapons.sidearm!.reserve).toBe(7);
    expect(b.journal.has("astrolabe")).toBe(true);
    // The Gilt boat revealed by the astrolabe event is still revealed after restoring.
    expect(b.world.boxes.find((x) => x.group === "giltboat")!.removed).toBe(false);
  });
});
