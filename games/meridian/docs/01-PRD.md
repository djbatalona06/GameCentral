# 01 — Product Requirements: Meridian

## In one sentence
Meridian is an original, story-driven treasure-hunting adventure for phones (and any browser) where you climb ruins, sneak past mercenaries, fight from cover and solve ancient puzzles.

## Who it's for
| Player | What they want | How Meridian serves them |
|---|---|---|
| Mobile action fans | Console-style adventure on a phone | Third-person 3D, touch controls built for thumbs, 60 fps target |
| Story players | A long adventure with characters they care about | 22-chapter story, ~25 hours, journal and treasures |
| Players with disabilities | To finish the game like everyone else | Accessibility presets on first launch, 50+ options (see `accessibility-matrix.md`) |
| Controller and keyboard players | Their preferred input | Full gamepad and keyboard/mouse support with remapping |

## The story (original)
Ines Calder, a salvage diver turned relic hunter, follows the 400-year-old route of navigator Catalina de Ordaz. Catalina hid three keys across three seas that open the Drowned City of Meridia. Ines's mentor Bram Okafor helps her. Varek Sorne and his Gilt Company mercenaries race them for it. Full outline: `story/outline.md`.

No names, characters, locations, story beats or assets come from any existing game series. Treasure hunting, climbing and cover shooting are shared genre conventions.

## Goals for this build
1. Ship every core system the full game needs, as a playable mobile web app **and** as Android/iOS store apps (Capacitor).
2. Ship **Act I: chapters 1–7** (about 3.2 hours with exploration), fully playable start to finish, in portrait or landscape.
2a. A story that responds: choices, relationships (Bram, Kessa), playstyle reactions and three endings, built into the engine and woven through Act I.
2b. A realistic look that holds 30 fps on a 2021 mid-range phone, and a full synthesised audio pass.
3. Outline all 22 chapters (about 25 hours) so future chapters are content work, not engine work.
4. Meet AAA accessibility expectations from day one.

## Non-goals (this build)
- Scanned/hand-made models and voice acting. The look and sound are procedural; real models drop in through asset slots later.
- Chapters 8–22 as playable levels. They are outlined and shown as "coming soon".
- Publishing to the stores (needs the owner's developer accounts; steps in `store-release.md`).
- Multiplayer, in-app purchases, accounts or online services.

## Core features (must have)
| Area | Requirement |
|---|---|
| Movement | Walk/run/sprint, crouch, jump with coyote time and input buffering, roll with invulnerability, slopes |
| Traversal | Ledge grab, shimmy, corner transfer, ledge-to-ledge hops, climb up, back-eject, free-climb walls, wall jumps, ropes, grapple hook, ziplines, balance beams, swimming, crate pushing, crumbling holds |
| Shooting | Hip fire and over-the-shoulder aim, shoulder swap, spread bloom, recoil pattern, headshots, damage falloff, 5 weapons, grenades with arc preview and throw-back, blind fire, shooting while hanging or swinging, destructible cover, explosive barrels |
| Melee & stealth | 3-hit combo, counters, environmental finishers, silent takedowns (behind, from ledge, from above, from grass), tall grass, bottle distractions, enemy tagging |
| Enemies | 7 types (rifleman, breacher, marksman, grenadier, heavy, brute, lieutenant boss) with vision, hearing, suspicion, cover use, flanking, squad attack limits |
| Story | Objectives, dialogue with subtitles, cutscenes, journal, treasures, puzzles, set pieces |
| Choices | Spoken answers at story moments (nine in Act I) that change who helps you, what people say and which of three endings is reachable; people remember how you play; short optional talks between chapters; no timers unless the player opts in |
| Saving | Auto-save at checkpoints, 3 slots + backup, export/import, works offline |
| Accessibility | Presets, subtitles, colour-blind modes, high contrast, text size, narration, aim/traversal/puzzle assists, remapping, one-handed touch layouts |
| Performance | 60 fps target on mid-range phones, quality tiers, dynamic resolution, 30 fps battery mode |

## Success measures
- A first-time player can finish chapter 1 using only touch controls.
- All automated route tests pass: every checkpoint is safe and every key jump is possible.
- No blocking bugs: you can always continue after dying or reloading.
- Every accessibility option in the matrix works and is reachable in two taps from the pause menu.

## Risks
| Risk | Plan |
|---|---|
| Touch controls feel cramped on small phones | Button size, opacity, position and one-handed layouts are all adjustable |
| Low-end phones drop frames | Quality tiers, dynamic resolution, 30 fps mode, sleeping distant enemies |
| 25 hours of content is a lot of level building | Levels are short data files built with a small DSL; route tests catch broken jumps |
