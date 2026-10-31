# 05 — Data & Storage Schema

Meridian has no server. "Backend" here means the data the game stores on the device, and the content data that defines chapters.

## Storage (IndexedDB database `meridian`, object store `kv`)
| Key | Value | Notes |
|---|---|---|
| `settings` | `Settings` | Shared by all slots. Missing fields fall back to defaults. |
| `save:0`, `save:1`, `save:2` | `SaveFile` | Manual slots |
| `save:99` | `SaveFile` | Rolling backup written at every checkpoint |

If IndexedDB is unavailable (some private-browsing modes), an in-memory store is used and the main menu warns that progress won't be kept.

## SaveFile (version 2)
```ts
SaveFile {
  version: 2
  slot: number
  createdAt, updatedAt: ISO date strings
  playtimeSec: number
  difficulty: 0 | 1 | 2 | 3            // Story, Explorer, Hunter, Legend
  currentChapter: "ch01" … "ch22"
  snapshot: Snapshot | null            // mid-chapter checkpoint
  chapters: { [chapterId]: ChapterProgress }
  journal: string[]                    // unlocked journal entry ids
  unlocks: string[]
  newGamePlus: boolean
}

ChapterProgress { completed, bestTimeSec?, treasures: string[], medals: string[], lastStats? }

Snapshot {                              // everything needed to rebuild a checkpoint
  chapterId, checkpointId
  firedEvents: string[]                 // story events replayed on restore (doors, bridges…)
  killed, pickupsTaken, treasures, interactsUsed, triggersFired, puzzlesSolved, journal: string[]
  loadout { sidearm, long: {id, mag, reserve} | null, active, grenades, bottles }
  objective, stats
  pending: { event, in }[]              // scheduled events that hadn't fired yet
}
```

### Relationships
```
Settings (1) ── applies to ──> all SaveFiles
SaveFile (1) ── has many ──> ChapterProgress (keyed by chapter id)
SaveFile (1) ── has 0..1 ──> Snapshot ── refers to ──> Chapter + Checkpoint
Snapshot.firedEvents ── refer to ──> ChapterScript.events keys
```

### Migrations
`src/save/migrations.ts` upgrades saves one version at a time (v1 → v2 → …). Upgraded saves are written back so migration happens once. Saves from a newer version are refused with a clear message. A test covers the v1 → v2 path.

## Content schema (chapters)
```ts
ChapterDef { id, number, title, location, synopsis, estMinutes, playable, build(): LevelData, script: ChapterScript }

LevelData {
  boxes (solid, optional cover/ledges/group/hp/explosive/wallJump), ramps, ledges, climbWalls,
  ropes (grapple?), ziplines, beams, water, grass, crates, pickups, collectibles,
  interacts (lever/door/examine/pillar/plate), triggers, checkpoints, enemies (archetype, arena, patrol, wave),
  arenas (nav-grid bounds), camHints, killY
}

ChapterScript {
  startLoadout, onStart: Action[], events: { [eventName]: Action[] }, puzzles, journal, parTimeMinutes
}

Action = dialogue | objective | spawn | remove | reveal | revealInteract | journal | cutscene
       | emit (delayed event) | tutorial | music | shake | give | stealth | checkpoint | complete
```
Event names come from triggers, interactables, puzzles (`onSolve`), wave clears (`waveClear:<wave>`, `arenaClear:<arena>`) and boss phases (`bossPhase:2`).

## Settings
`gameplay` (difficulty and sliders, assists), `controls` (key/pad bindings, toggles, sensitivity, gyro, vibration, touch layout/size/opacity/positions), `a11y` (subtitles, colour-blind mode, contrast, text size, motion, narration, indicators), `audio` (5 volumes, mono), `video` (quality, fps cap, dynamic resolution, brightness, fps counter).
