# 05 — Data & Storage Schema

Meridian has no server. "Backend" here means the data the game stores on the device, and the content data that defines chapters.

## Storage (IndexedDB database `meridian`, object store `kv`)
| Key | Value | Notes |
|---|---|---|
| `settings` | `Settings` | Shared by all slots. Missing fields fall back to defaults. |
| `save:0`, `save:1`, `save:2` | `SaveFile` | Manual slots |
| `save:99` | `SaveFile` | Rolling backup written at every checkpoint |

If IndexedDB is unavailable (some private-browsing modes), an in-memory store is used and the main menu warns that progress won't be kept.

## SaveFile (version 3)
```ts
SaveFile {
  version: 3
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
  story: StoryState                    // what the story remembers between chapters (new in v3)
}

StoryState {
  flags: { [name]: true }              // things that happened, e.g. "kessa.spared"
  rel: { bram: 0..10, kessa: 0..10 }   // Bram's trust, Kessa's respect
  stance: -5..5                        // Keeper (negative) to Seeker (positive)
  choices: { [choiceId]: optionId }
  style: "ghost" | "brawler" | "mixed" // how the last chapter was played
}

ChapterProgress { completed, bestTimeSec?, treasures: string[], medals: string[], lastStats? }

Snapshot {                              // everything needed to rebuild a checkpoint
  chapterId, checkpointId
  firedEvents: string[]                 // story events replayed on restore (doors, bridges…)
  killed, pickupsTaken, treasures, interactsUsed, triggersFired, puzzlesSolved, journal: string[]
  loadout { sidearm, long: {id, mag, reserve} | null, active, grenades, bottles }
  objective, stats
  pending: { event, in }[]              // scheduled events that hadn't fired yet
  story?: StoryState                    // restored directly, never replayed (so nothing is counted twice)
  openChoices?: string[]                // questions asked but not yet answered
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
`src/save/migrations.ts` upgrades saves one version at a time (v1 → v2 → v3 → …). v2 → v3 adds a neutral `story`; choices made before v3 cannot be recovered. Upgraded saves are written back so migration happens once. Saves from a newer version are refused with a clear message. A test covers the v1 → v2 path.

## Content schema (chapters)
```ts
ChapterDef { id, number, title, location, synopsis, estMinutes, playable, build(): LevelData, script: ChapterScript }

LevelData {
  boxes (solid, optional cover/ledges/group/hp/explosive/wallJump), ramps, ledges, climbWalls,
  ropes (grapple?), ziplines, beams, water, grass, crates, pickups, collectibles,
  interacts (lever/door/examine/pillar/plate), triggers, checkpoints, enemies (archetype, arena, patrol, wave),
  arenas (nav-grid bounds), camHints, killY,
  movers (group + path), hazards (sweeping/static kill boxes), tracks + pursuers (vehicle chase),
  weather volumes, searchlights, scroll (visual scenery speed)
}

ChapterScript {
  startLoadout, onStart: Action[], events: { [eventName]: Action[] }, puzzles, journal, parTimeMinutes,
  downtime?: DowntimeTalk[]            // optional talks after the chapter
}

ChapterDef also has: beats? (hook, rising, setPiece, choice, fallout) and branchNotes? (for unbuilt chapters)

Action = dialogue | objective | spawn | remove | reveal | revealInteract | journal | cutscene
       | emit (delayed event) | tutorial | music | shake | give | stealth | checkpoint
       | mover | hazard | weather | searchlight (switch on/off) | vehicle (enter a track) | pursuit (spawn enemy jeeps)
       | choice (ask the player) | branch (if / then / otherwise) | set (flag) | rel (trust or respect) | stance
       | complete

Line { speaker, text, duration?, if?: Condition }          // a line is only said when its rule holds
Condition = flag | treasure | rel (min/max) | stance (keeper/seeker) | chose (choice, option) | style | all | any | not
ChoiceDef { id, prompt, speaker?, options: { id, label, hint?, requires?, effects? }[], defaultOption, timeoutSec? }
Effects { rel?: { bram?, kessa? }, stance?, set?: string[] }
```
Picking option `o` of choice `c` applies its effects once, records `choices[c] = o`, then raises the story event `"c:o"`. Chapter story (choices, reactions, quiet talks) is kept apart from level layout in `src/sim/chapters/story/chNN.story.ts` and merged by `withStory`.
Event names come from triggers, interactables, puzzles (`onSolve`), wave clears (`waveClear:<wave>`, `arenaClear:<arena>`), boss phases (`bossPhase:2`), cleared chases (`pursuitClear:<group>`) and searchlight alarms (`searchlightAlarm:<id>`). Puzzle types: pillars, sequence, plates, bells.

On checkpoint restore, world-changing actions are replayed. Hazards are deliberately **not** replayed (a tunnel sweep is a moment, not a state).

## Settings
`gameplay` (difficulty and sliders, assists), `controls` (key/pad bindings, toggles, sensitivity, gyro, vibration, touch layout/size/opacity/positions), `a11y` (subtitles, colour-blind mode, contrast, text size, motion, narration, indicators), `audio` (6 volumes incl. world sounds, mono, ducking, night mode), `video` (quality low/medium/high/ultra, fps cap — 30 by default on phones, dynamic resolution, brightness, fps counter).

Settings version 2 stores touch button positions per orientation: `controls.touchPositions = { landscape: {...}, portrait: {...} }`. `migrateSettings()` moves a v1 single set into `landscape`. New fields added later are filled from defaults automatically (`mergeDefaults`).
