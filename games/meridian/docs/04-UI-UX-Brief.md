# 04 — UI/UX Design Brief

## Feel
Cinematic and calm: a dark navy UI with warm brass accents, like an old navigator's instrument case. Menus stay out of the way, and the world is the star.

## Visual language
| Token | Value | Use |
|---|---|---|
| Background | `#0f1418` | Menus |
| Ink | `#f3ecdc` | Text |
| Brass accent | `#e9b949` | Primary buttons, objective bar |
| Focus | `#ffd75e` (`#00e5ff` in high contrast) | Focus outline |
| Danger | `#ff5a4e` | Low ammo, damage, alerts |
| Display font | Georgia / serif | Titles |
| Body font | System UI | Everything else (fast, readable, no downloads) |

## World language (readable cues on top of the realistic look)
These cues teach the player without words:
- **Chalk-white edges** = you can grab this ledge. **Orange edges** = it will crumble.
- **Knobbly pale pattern** on a wall = free-climbable.
- **Gold diamond with a light beam** = treasure.
- **Spinning yellow diamond** = something to use (lever, pillar, artifact).
- **Yellow ring** high up = grapple point.
- **Red barrels** explode. Light wooden cover breaks; stone does not.
- Enemy **meter above the head**: yellow while suspicious, red when alerted. A **red laser** means a marksman is about to fire.
- In high-contrast mode, the world turns dark grey, enemies bright red, the player blue and interactables yellow.
- **Searchlight beams** warm from pale yellow to red as the "Spotted" meter fills. **Bells** swing and glow when rung, and the note appears as a caption.
- **Big red banners** warn about tunnels and avalanches ("Tunnel! Get down!").

## Look (art pass)
Grounded, sun-baked realism without image files: physically based materials painted from noise (stone blocks, wood grain, rusty riveted metal, rippled sand, snow), a gradient sky, ACES tone mapping, sun shadows, shader water and jointed characters. Night chapters (train, docks) use cool moonlight and warm lamps. Details in `realistic-art-on-phones.md`.

## HUD layout (landscape phone)
```
┌──────────────────────────────────────────────────────────┐
│ OBJECTIVE ▌ Reach the shipwreck      [GOAL]  Harbor 9 15/45 [II]│
│        Top stack: warning · meters · tip · hint · toasts │
│                         reticle + threat arrows           │
│   Bottom stack: prompt · shout · subtitles [THROW] [RELOAD]│
│                                    [USE]  [FIRE]  [COVER] │
│  (floating stick)                 [AIM] [MELEE]   [JUMP]  │
└──────────────────────────────────────────────────────────┘
```
- Everything respects the safe area (notches, rounded corners).
- Messages live in two **stacks** so they line up instead of overlapping: the **top stack** (warnings, Spotted/Jeep meters, bell notes, tips, hints, toasts) and the **bottom stack** (balance bar, button prompt, shouts, subtitles). On a computer the top stack sits under the objective/ammo row; on touch both stacks sit in the free middle area between the left cards and the right buttons, and mirror for the left-handed layout.
- **Subtitles** are at most about two lines: the game splits long lines into short captions (64 characters each) shown one after another. **Shouts** ("Grenade out!") and character chatter appear in a small line of their own, so they never replace a story subtitle.
- **Tips use the player's device words**: "press Space" on a keyboard, "press A" on a controller, "press Jump" on touch, and never "swipe the screen" on a computer. Remapped keys show their new name.
- On a computer, "Click to look around" shows while the mouse is not captured.
- The reticle grows with weapon spread, turns red over an enemy, and shows an X hit marker (red for a kill).
- Red vignette = low health. Arcs = direction of damage. Labels on a ring = sounds (when sound indicators are on).
- A slim bar under the top HUD shows the **Spotted** meter (searchlights) or the **Jeep** condition, only when relevant.

## Screen shape
The game is **landscape only**: the HUD and touch layouts are designed for a wide screen. A touch phone held upright shows a full-screen "Turn your phone sideways" prompt and the game pauses until it is turned. Computers can use any window shape; very narrow windows keep the horizontal view by widening the camera.

## Touch controls
- A **floating stick** appears where the left thumb lands. Pushing past the ring sprints.
- Swipe anywhere on the right to look. **Fire, Aim and Throw** also turn the camera while held, so you can aim and shoot with one thumb.
- The **Use** button lights up and relabels itself ("Grapple", "Take Breaker 12"). Melee glows red when a takedown is possible.
- Size (0.7–1.6×), opacity and position are adjustable. There are two-thumb, one-hand-right and one-hand-left layouts.

## Motion
- Menu screens glide in; menu buttons arrive one after another; buttons lift and glow on hover/focus. The title compass turns slowly, its needle hunts for north, and the logo shimmers. The home and main menu let the slowly orbiting beach show through.
- In play: birds circle overhead (gulls by the sea), fish swim and leap in the water, dust motes (fireflies at night) drift by; bullets kick up sparks and dust; feet puff dust on landings, rolls and sprints; water splashes ring outwards; the view widens a touch while sprinting and dips on a hard landing; a knockout freezes the action for a blink.
- "Reduce motion" removes UI animation, the sprint/landing camera moves, the knockout freeze and the drifting motes, halves the wildlife, and cuts camera shake by 80%.

## Writing style
Short, plain sentences. Tutorials say what to press and why ("Crouch in tall grass to hide."). Dialogue is warm and a little funny.
