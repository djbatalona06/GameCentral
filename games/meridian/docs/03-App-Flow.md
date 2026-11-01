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
                                    ├─ Story question (world waits; pick an answer) → back to Playing
                                    ├─ Death → Retry · Retry easier · Quit
                                    └─ Chapter complete → Results (stats, medals, "Because of you") → Quiet moment (optional talk) → Next chapter · Replay · Menu
```
*Skip puzzle appears only when the player has struggled (assist setting).

## Story questions and quiet moments
- A question opens only when nothing else is competing for the player: dialogue has finished, no cutscene is running and no fight is on. The world freezes while it is open.
- Answers: tap or click, keys 1 to 4, or the gamepad D-pad and A. There is no Back; the player may take as long as they like. With "Timed story choices" on (off by default) each question has a countdown and picks its quiet default.
- A chapter never ends in the middle of a question or while someone is still speaking.
- After results, a "quiet moment" offers up to three short talks (only one can be taken). Skipping is always possible.
- Replaying a finished chapter keeps the first answers; nothing is counted twice.

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
- Rotating the phone at any time re-lays out the HUD and touch controls for the new orientation; held buttons are released so nothing gets stuck.

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
