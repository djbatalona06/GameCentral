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

## Greybox world language
These cues teach the player without words:
- **Chalk-white edges** = you can grab this ledge. **Orange edges** = it will crumble.
- **Knobbly pale pattern** on a wall = free-climbable.
- **Gold diamond with a light beam** = treasure.
- **Spinning yellow diamond** = something to use (lever, pillar, artifact).
- **Yellow ring** high up = grapple point.
- **Red barrels** explode. Light wooden cover breaks; stone does not.
- Enemy **meter above the head**: yellow while suspicious, red when alerted. A **red laser** means a marksman is about to fire.
- In high-contrast mode, the world turns dark grey, enemies bright red, the player blue and interactables yellow.

## HUD layout (landscape phone)
```
┌──────────────────────────────────────────────────────────┐
│ OBJECTIVE ▌ Reach the shipwreck      [GOAL]  Harbor 9 15/45 [II]│
│ Tutorial card (left half)                                  │
│                         reticle + threat arrows           │
│ Subtitles (left half)                     [THROW] [RELOAD]│
│                                    [USE]  [FIRE]  [COVER] │
│  (floating stick)                 [AIM] [MELEE]   [JUMP]  │
└──────────────────────────────────────────────────────────┘
```
- Everything respects the safe area (notches, rounded corners).
- With touch controls on, subtitles and tutorials sit in the half of the screen without buttons. With the left-handed layout, they mirror.
- The reticle grows with weapon spread, turns red over an enemy, and shows an X hit marker (red for a kill).
- Red vignette = low health. Arcs = direction of damage. Labels on a ring = sounds (when sound indicators are on).

## Touch controls
- A **floating stick** appears where the left thumb lands. Pushing past the ring sprints.
- Swipe anywhere on the right to look. **Fire, Aim and Throw** also turn the camera while held, so you can aim and shoot with one thumb.
- The **Use** button lights up and relabels itself ("Grapple", "Take Breaker 12"). Melee glows red when a takedown is possible.
- Size (0.7–1.6×), opacity and position are adjustable. There are two-thumb, one-hand-right and one-hand-left layouts.

## Motion
- Menu transitions: 0.2 s fade. Toasts slide in.
- "Reduce motion" removes UI animation and cuts camera shake by 80%.

## Writing style
Short, plain sentences. Tutorials say what to press and why ("Crouch in tall grass to hide."). Dialogue is warm and a little funny.
