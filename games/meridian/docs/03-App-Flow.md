# 03 — App Flow

## Screen map
```
Boot
 └─ First launch only: Accessibility setup (text size, subtitles, narration, presets)
     └─ Title ("Tap to start", unlocks audio)
         └─ Main menu
             ├─ Continue ───────────────┐
             ├─ New game → Slot → Difficulty ─┤
             ├─ Load game → Slot ───────┤ (export / delete / import)
             ├─ Chapter select ─────────┤ (completed + current chapters)
             ├─ Settings (tabs: Accessibility, Gameplay, Controls, Audio, Video)
             │    └─ Controls → Move touch buttons (layout editor)
             └─ Credits
                                        ▼
                                   Playing (HUD + touch controls)
                                    ├─ Pause → Resume · Skip puzzle* · Journal · Settings · Restart checkpoint · Save & quit
                                    ├─ Cutscene (letterbox, Skip button)
                                    ├─ Death → Retry · Retry easier · Quit
                                    └─ Chapter complete → Results (stats, medals) → Next chapter · Replay · Menu
```
*Skip puzzle appears only when the player has struggled (assist setting).

## Navigation rules
| Input | Move | Select | Back |
|---|---|---|---|
| Touch / mouse | tap | tap | on-screen Back |
| Keyboard | arrows / Tab | Enter / Space | Escape |
| Gamepad | D-pad or left stick (with repeat) | A | B |

- Focus always starts on the screen's main action, and is outlined in high-visibility yellow.
- With narration on, every focused item is read aloud ("Subtitles, on").
- Pausing happens automatically when the app goes to the background or the mouse is released.
- In the Android app, the hardware **Back** button acts as Back in menus and as Pause during play.
- The game is landscape only. Holding a touch phone upright pauses the game behind a "Turn your phone sideways" prompt; turning it back resumes by itself (a game the player paused stays paused). Held buttons are released when the game pauses so nothing gets stuck.

## In-game flow of a chapter
1. The chapter loads its level and runs its start script (music, objective, intro dialogue, first tutorial).
2. Triggers, interactables, puzzles and wave clears fire **story events**. Each event runs a list of actions (dialogue, objective, spawn wave, open door, cutscene, checkpoint…).
3. Walking near a checkpoint (when no enemy can see you) saves automatically.
4. Death shows the death screen after 1.6 s. Retry rebuilds the chapter from the last checkpoint snapshot.
5. The final event shows results, records medals and treasures, and unlocks the next chapter.

## Debug and test entry points
- `?chapter=2` starts chapter 2 directly.
- `?debug=1` exposes `window.__meridian` for automated tests, and `__meridian.renderer.stats()` (draw calls, triangles, tier).
- `?debug&quality=low|medium|high|ultra` forces a quality tier.
- Chapters 1–7 can all be opened directly with `?chapter=N`.
